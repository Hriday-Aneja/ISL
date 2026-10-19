import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socket';
import type {
  CallStatus,
  JoinAck,
  PeerJoinedPayload,
  PeerMessage,
  PeerLeftPayload,
  SignalPayload,
} from '../types/videoCall';

// Isolated here so a TURN server can be dropped in later (e.g. for
// cross-network/hackathon-demo-day use) without touching call logic
// anywhere else.
const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface UseVideoCallResult {
  status: CallStatus;
  errorMessage: string | null;
  roomId: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
  prepareLocalStream: () => Promise<boolean>;
  createRoom: () => Promise<void>;
  joinRoom: (roomId: string) => Promise<void>;
  toggleMicrophone: () => void;
  toggleCamera: () => void;
  endCall: () => void;
  resetToIdle: () => void;
  /** Sends a peer message over the call's data channel. Returns false if the
   * channel isn't open yet. */
  sendPeerMessage: (message: PeerMessage) => boolean;
}

/**
 * Owns the WebRTC + signaling lifecycle for a single two-person call.
 *
 * `localStream` is the same MediaStream instance used for the call itself —
 * it's exposed here specifically so it can later be handed to the ISL
 * recognition model (a video frame source) without opening a second
 * camera. Speech-to-text keeps using the Web Speech API's own microphone
 * access, which is independent of this stream.
 */
export function useVideoCall(
  onPeerMessage?: (message: PeerMessage) => void,
  onPeerReady?: () => void
): UseVideoCallResult {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);

  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remotePeerIdRef = useRef<string | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const endedByUserRef = useRef(false);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const onPeerMessageRef = useRef(onPeerMessage);
  const onPeerReadyRef = useRef(onPeerReady);
  onPeerMessageRef.current = onPeerMessage;
  onPeerReadyRef.current = onPeerReady;

  // Small side-channel on the existing peer connection for live captions and
  // finished signed/spoken messages. Video/audio and signaling are untouched.
  const attachDataChannel = useCallback((channel: RTCDataChannel) => {
    dataChannelRef.current = channel;
    channel.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as PeerMessage;
        if (message?.type === 'peer-meta') {
          if (typeof message.displayName === 'string') onPeerMessageRef.current?.(message);
        } else if (message && 'text' in message && typeof message.text === 'string') {
          onPeerMessageRef.current?.(message);
        }
      } catch {
        /* malformed message — ignore */
      }
    };
    channel.onopen = () => onPeerReadyRef.current?.();
    if (channel.readyState === 'open') onPeerReadyRef.current?.();
  }, []);

  const closePeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.ondatachannel = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    dataChannelRef.current = null;
    remotePeerIdRef.current = null;
    pendingCandidatesRef.current = [];
    setRemoteStream(null);
  }, []);

  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const createPeerConnection = useCallback((peerId: string) => {
    const pc = new RTCPeerConnection(ICE_CONFIG);
    remotePeerIdRef.current = peerId;

    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current!);
    });

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0] ?? null);
    };

    // The answering side receives the channel the offerer created.
    pc.ondatachannel = (event) => attachDataChannel(event.channel);

    pc.onicecandidate = (event) => {
      if (event.candidate && roomIdRef.current) {
        getSocket().emit('ice-candidate', {
          roomId: roomIdRef.current,
          target: peerId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case 'connected':
          setStatus('connected');
          setErrorMessage(null);
          break;
        case 'failed':
          setStatus('connection_failed');
          setErrorMessage('Could not establish a connection to your peer.');
          break;
        case 'disconnected':
          // Transient — WebRTC often recovers on its own. A hard failure
          // will follow up with 'failed', or the server will tell us the
          // peer left explicitly.
          break;
        default:
          break;
      }
    };

    pcRef.current = pc;
    return pc;
  }, [attachDataChannel]);

  const acquireLocalStream = useCallback(async (showLoading = true): Promise<MediaStream> => {
    if (localStreamRef.current) return localStreamRef.current;
    if (showLoading) setStatus('requesting_media');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: true,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMicEnabled(true);
      setCameraEnabled(true);
      setErrorMessage(null);
      if (!showLoading) setStatus('idle');
      return stream;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setStatus('permission_denied');
        setErrorMessage(
          'Camera and microphone access was denied. Allow permission in your browser to start a call.'
        );
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setStatus('no_device');
        setErrorMessage('No camera or microphone was found on this device.');
      } else {
        setStatus('connection_failed');
        setErrorMessage('Could not access your camera/microphone. Check that no other app is using them.');
      }
      throw err;
    }
  }, []);

  const prepareLocalStream = useCallback(async () => {
    try {
      await acquireLocalStream(false);
      return true;
    } catch {
      return false;
    }
  }, [acquireLocalStream]);

  // ---- Socket event wiring (registered once) ----
  useEffect(() => {
    const socket = getSocket();

    const handlePeerJoined = async ({ peerId }: PeerJoinedPayload) => {
      // We were already in the room, so we're the offerer.
      setStatus('connecting');
      const stream = localStreamRef.current;
      if (!stream) return;
      const pc = createPeerConnection(peerId);
      // Must exist before createOffer() so it's negotiated in the same offer.
      attachDataChannel(pc.createDataChannel('isl-messages'));
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', {
          roomId: roomIdRef.current,
          target: peerId,
          description: offer,
        });
      } catch {
        setStatus('connection_failed');
        setErrorMessage('Failed to start the call with your peer.');
      }
    };

    const handleOffer = async ({ from, description }: SignalPayload) => {
      if (!description) return;
      setStatus('connecting');
      const pc = createPeerConnection(from);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(description));
        for (const candidate of pendingCandidatesRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingCandidatesRef.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', {
          roomId: roomIdRef.current,
          target: from,
          description: answer,
        });
      } catch {
        setStatus('connection_failed');
        setErrorMessage('Failed to answer the incoming call.');
      }
    };

    const handleAnswer = async ({ description }: SignalPayload) => {
      if (!description || !pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(description));
        for (const candidate of pendingCandidatesRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingCandidatesRef.current = [];
      } catch {
        setStatus('connection_failed');
        setErrorMessage('Failed to complete the connection to your peer.');
      }
    };

    const handleIceCandidate = async ({ candidate }: SignalPayload) => {
      if (!candidate) return;
      if (pcRef.current?.remoteDescription) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // Non-fatal — a stray/late candidate. Ignore.
        }
      } else {
        pendingCandidatesRef.current.push(candidate);
      }
    };

    const handlePeerLeft = (_payload: PeerLeftPayload) => {
      closePeerConnection();
      if (!endedByUserRef.current) setStatus('peer_left');
    };

    socket.on('peer-joined', handlePeerJoined);
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('peer-left', handlePeerLeft);

    return () => {
      socket.off('peer-joined', handlePeerJoined);
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('peer-left', handlePeerLeft);
    };
  }, [closePeerConnection, createPeerConnection, attachDataChannel]);

  // Full teardown on unmount (e.g. navigating away from the room).
  useEffect(() => {
    return () => {
      closePeerConnection();
      stopLocalStream();
      if (roomIdRef.current) {
        getSocket().emit('leave-room', { roomId: roomIdRef.current });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createRoom = useCallback(async () => {
    endedByUserRef.current = false;
    setErrorMessage(null);
    try {
      await acquireLocalStream();
    } catch {
      return;
    }
    setStatus('creating');
    const socket = getSocket();
    socket.emit('create-room', {}, (ack: JoinAck) => {
      if (!ack.ok || !ack.roomId) {
        setStatus('connection_failed');
        setErrorMessage('Could not create a room. Check your connection and try again.');
        return;
      }
      roomIdRef.current = ack.roomId;
      setRoomId(ack.roomId);
      setStatus('waiting');
    });
  }, [acquireLocalStream]);

  const joinRoom = useCallback(
    async (id: string) => {
      const cleanId = id.trim().toUpperCase();
      if (!cleanId) return;
      endedByUserRef.current = false;
      setErrorMessage(null);
      try {
        await acquireLocalStream();
      } catch {
        return;
      }
      setStatus('joining');
      const socket = getSocket();
      socket.emit('join-room', { roomId: cleanId }, (ack: JoinAck) => {
        if (!ack.ok) {
          if (ack.error === 'full') {
            setStatus('room_full');
            setErrorMessage('This room already has two people in it.');
          } else {
            setStatus('room_not_found');
            setErrorMessage("That room ID doesn't exist. Check it and try again.");
          }
          stopLocalStream();
          return;
        }
        roomIdRef.current = cleanId;
        setRoomId(cleanId);
        // If a peer is already there, they'll receive our 'peer-joined'
        // event and send us an offer — we just wait for it.
        setStatus(ack.peerId ? 'connecting' : 'waiting');
      });
    },
    [acquireLocalStream, stopLocalStream]
  );

  const toggleMicrophone = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !micEnabled;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setMicEnabled(next);
  }, [micEnabled]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !cameraEnabled;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setCameraEnabled(next);
  }, [cameraEnabled]);

  const sendPeerMessage = useCallback((message: PeerMessage) => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== 'open') return false;
    channel.send(JSON.stringify(message));
    return true;
  }, []);

  const endCall = useCallback(() => {
    endedByUserRef.current = true;
    if (roomIdRef.current) {
      getSocket().emit('leave-room', { roomId: roomIdRef.current });
    }
    closePeerConnection();
    stopLocalStream();
    roomIdRef.current = null;
    setRoomId(null);
    setStatus('ended');
  }, [closePeerConnection, stopLocalStream]);

  const resetToIdle = useCallback(() => {
    endedByUserRef.current = false;
    setErrorMessage(null);
    setStatus('idle');
  }, []);

  return {
    status,
    errorMessage,
    roomId,
    localStream,
    remoteStream,
    micEnabled,
    cameraEnabled,
    prepareLocalStream,
    createRoom,
    joinRoom,
    toggleMicrophone,
    toggleCamera,
    endCall,
    resetToIdle,
    sendPeerMessage,
  };
}
