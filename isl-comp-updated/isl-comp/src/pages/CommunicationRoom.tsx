import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clock3, Hand, LockKeyhole, Settings, ShieldCheck } from 'lucide-react';
import { CameraPanel } from '../components/communication/CameraPanel';
import { SpeechPanel } from '../components/communication/SpeechPanel';
import { TranscriptDrawer } from '../components/communication/TranscriptDrawer';
import { ManualTextInput } from '../components/communication/ManualTextInput';
import { SettingsPanel } from '../components/communication/SettingsPanel';
import { CallControls } from '../components/communication/CallControls';
import { StatusBar } from '../components/communication/StatusBar';
import { RoomGate } from '../components/communication/RoomGate';
import { RoomStatusBanner } from '../components/communication/RoomStatusBanner';
import { RemoteVideoStage } from '../components/communication/RemoteVideoStage';
import { LocalVideoPiP } from '../components/communication/LocalVideoPiP';
import { AvatarPanel } from '../components/communication/AvatarPanel';
import { CaptionOverlay, type StageCaption } from '../components/communication/CaptionOverlay';
import { useVideoCall } from '../hooks/useVideoCall';
import { useAvatarPlayer } from '../hooks/useAvatarPlayer';
import { SIGN_LABELS } from '../data/signMappings';
import type { ConversationEntry, SessionStatus, SignId } from '../types';
import { ROLE_LABEL, type PeerMessage, type UserRole } from '../types/videoCall';

const CONNECTION_LABEL: Record<string, { label: string; dot: string }> = {
  waiting: { label: 'Waiting for peer', dot: 'bg-voice' },
  connecting: { label: 'Connecting…', dot: 'bg-voice' },
  connected: { label: 'Connected', dot: 'bg-signal' },
  peer_left: { label: 'Peer left', dot: 'bg-voice' },
  connection_failed: { label: 'Connection issue', dot: 'bg-alert' },
};

function getSavedDisplayName() {
  try {
  return localStorage.getItem('samvaad-display-name') ?? '';
  } catch {
    return '';
  }
}

function formatDuration(seconds: number, compact = false) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (compact) {
    return `${String(hours * 60 + minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, '0')).join(':');
}

export function CommunicationRoom() {
  const { roomId: routeRoomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  // Role is chosen in the gate before creating/joining, or carried by an
  // invite link (?role=isl|hearing) so the joiner lands in the other interface.
  const roleParam = searchParams.get('role');
  const [role, setRole] = useState<UserRole | null>(
    roleParam === 'isl' || roleParam === 'hearing' ? roleParam : null
  );
  const [displayName, setDisplayName] = useState(getSavedDisplayName);
  // Filled in below once the handler (which needs state declared after the
  // call hook) exists; the hook only ever calls it through this ref.
  const peerMessageHandlerRef = useRef<(message: PeerMessage) => void>(() => {});
  const peerReadyHandlerRef = useRef<() => void>(() => {});
  const call = useVideoCall(
    (message) => peerMessageHandlerRef.current(message),
    () => peerReadyHandlerRef.current()
  );
  // Lifted up (rather than owned inside SpeechPanel) so the shared call
  // stage below can render the avatar's mini-pane from the same playback
  // state SpeechPanel drives via playSigns() — the hook itself is
  // untouched, just instantiated one level higher.
  const avatar = useAvatarPlayer();

  const [entries, setEntries] = useState<ConversationEntry[]>([]);
  const [liveEntry, setLiveEntry] = useState<Pick<ConversationEntry, 'speaker' | 'speakerName' | 'text'> | null>(null);
  const [status, setStatus] = useState<SessionStatus>('ready');
  const [speakerOn, setSpeakerOn] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  );
  const [sidebarTab, setSidebarTab] = useState<'transcript' | 'tools'>('transcript');
  const [tilesSwapped, setTilesSwapped] = useState(false);
  const [avatarVisible, setAvatarVisible] = useState(true);
  const [recognitionRequest, setRecognitionRequest] = useState(0);
  const [recognizingSigns, setRecognizingSigns] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [ended, setEnded] = useState(false);
  const [externalInput, setExternalInput] = useState<{ text: string; nonce: number } | null>(
    null
  );
  // Drives the CaptionOverlay on the video stage — the same final sentence
  // MessageCard shows in the panel below, just mirrored up onto the stage
  // for a call-style caption. No new translation logic; this only records
  // what handleIslSentence/handleSendToAvatar already receive.
  const [stageCaption, setStageCaption] = useState<StageCaption | null>(null);
  // The other person's latest sentence: the ISL user's signed sentence (shown
  // to the hearing user) or the hearing user's speech (shown to the ISL user).
  const [receivedMessage, setReceivedMessage] = useState('');
  const [remoteParticipant, setRemoteParticipant] = useState({
    displayName: '',
    cameraEnabled: true,
    micEnabled: true,
  });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const meetingStartedAtRef = useRef<number | null>(null);
  // Fullscreen applies to the whole call container (header + stage + controls).
  const roomRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      roomRef.current?.requestFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    if (!call.roomId) {
      meetingStartedAtRef.current = null;
      setElapsedSeconds(0);
      return;
    }
    if (!meetingStartedAtRef.current) meetingStartedAtRef.current = Date.now();
    const timer = window.setInterval(() => {
      const startedAt = meetingStartedAtRef.current;
      if (startedAt) setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [call.roomId]);

  const saveDisplayName = useCallback((name: string) => {
    const cleanName = name.trim().slice(0, 40);
    if (!cleanName) return;
    setDisplayName(cleanName);
    try {
      localStorage.setItem('samvaad-display-name', cleanName);
    } catch {
      // The current room name still works when browser storage is unavailable.
    }
  }, []);

  const addEntry = useCallback(
    (speaker: ConversationEntry['speaker'], text: string, signs?: SignId[], speakerName?: string) => {
      setEntries((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          speaker,
          speakerName,
          text,
          signs,
          timestamp: Date.now(),
        },
      ]);
    },
    []
  );

  const handleIslSentence = useCallback(
    (text: string, signs: SignId[]) => {
      if (!text) return;
      addEntry('isl_user', text, signs, displayName);
      setLiveEntry(null);
      setStatus('translation_ready');
      call.sendPeerMessage({ type: 'sign', text, signs });
    },
    [addEntry, call.sendPeerMessage, displayName]
  );

  const handleSendToAvatar = useCallback(
    (text: string, signs: SignId[]) => {
      if (!text) return;
      addEntry('hearing_user', text, signs, displayName);
      setLiveEntry(null);
      setStatus(signs.length ? 'avatar_signing' : 'ready');
      call.sendPeerMessage({ type: 'speech', text, signs });
    },
    [addEntry, call.sendPeerMessage, displayName]
  );

  const handleLiveTranscript = useCallback(
    (text: string) => {
      setLiveEntry(text ? { speaker: 'hearing_user', speakerName: displayName || 'You', text } : null);
      call.sendPeerMessage({ type: 'speech-live', text });
    },
    [call.sendPeerMessage, displayName]
  );

  const sendPeerMetadata = useCallback(() => {
    call.sendPeerMessage({
      type: 'peer-meta',
      displayName: displayName || 'Guest',
      micEnabled: call.micEnabled,
      cameraEnabled: call.cameraEnabled,
    });
  }, [call.sendPeerMessage, call.micEnabled, call.cameraEnabled, displayName]);
  peerReadyHandlerRef.current = sendPeerMetadata;

  useEffect(() => {
    if (call.status === 'connected') sendPeerMetadata();
  }, [call.status, sendPeerMetadata]);

  // Each interface only reacts to what the *other* role sends.
  const handlePeerMessage = useCallback(
    (message: PeerMessage) => {
      if (message.type === 'peer-meta') {
        setRemoteParticipant({
          displayName: message.displayName.trim().slice(0, 40) || 'Participant',
          micEnabled: message.micEnabled,
          cameraEnabled: message.cameraEnabled,
        });
        return;
      }
      if (role === 'isl' && message.type === 'speech-live' && !message.text) {
        setLiveEntry(null);
        setStageCaption(null);
        return;
      }
      if (!('text' in message) || !message.text) return;
      if (role === 'isl' && message.type === 'speech-live') {
        setLiveEntry({
          speaker: 'hearing_user',
          speakerName: remoteParticipant.displayName || 'Hearing User',
          text: message.text,
        });
        setReceivedMessage(message.text);
        setStageCaption({ eyebrow: `${remoteParticipant.displayName || 'Hearing user'} said`, text: message.text, tone: 'voice' });
        return;
      }
      const signs = ('signs' in message && Array.isArray(message.signs) ? message.signs : []).filter(
        (sign) => sign in SIGN_LABELS
      );
      if (role === 'isl' && message.type === 'speech') {
        setLiveEntry(null);
        addEntry('hearing_user', message.text, signs, remoteParticipant.displayName || 'Hearing User');
        setReceivedMessage(message.text);
        setStatus('avatar_signing');
        setStageCaption({ eyebrow: `${remoteParticipant.displayName || 'Hearing user'} said`, text: message.text, tone: 'voice' });
        avatar.playSigns(signs);
      } else if (role === 'hearing' && message.type === 'sign') {
        setLiveEntry(null);
        addEntry('isl_user', message.text, signs, remoteParticipant.displayName || 'ISL User');
        setReceivedMessage(message.text);
        setStatus('translation_ready');
        setStageCaption({ eyebrow: `${remoteParticipant.displayName || 'ISL user'} signed`, text: message.text, tone: 'signal' });
      }
    },
    [role, addEntry, avatar.playSigns, remoteParticipant.displayName]
  );
  peerMessageHandlerRef.current = handlePeerMessage;

  const handleEndSession = () => {
    call.endCall();
    window.speechSynthesis?.cancel();
    setStatus('ready');
    setStageCaption(null);
    setReceivedMessage('');
    setEnded(true);
  };

  const handleStartNewSession = () => {
    call.resetToIdle();
    setEnded(false);
    setRole(null);
    setReceivedMessage('');
    setEntries([]);
    setSpeakerOn(true);
  };

  if (ended) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-5 overflow-hidden bg-room-bg px-6 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-[360px] w-[360px] animate-blob-drift rounded-full bg-signal opacity-[0.16] blur-[100px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-24 h-[320px] w-[320px] animate-blob-drift rounded-full bg-voice opacity-[0.14] blur-[100px] [animation-delay:-6s]"
        />
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-signal/15 text-signal">
          <ShieldCheck size={22} />
        </span>
        <div className="relative">
          <h1 className="relative font-display text-3xl font-bold tracking-tight text-room-text">Session ended</h1>
          <p className="mt-2 max-w-sm text-sm text-room-text-soft">
            Camera, microphone, and the call have been stopped. The transcript from this session
            is no longer being recorded.
          </p>
        </div>
        <div className="relative flex gap-3">
          <Link to="/" className="room-icon-btn h-auto w-auto rounded-full px-5 py-2.5 text-sm font-semibold">
            Back to home
          </Link>
          <button onClick={handleStartNewSession} className="btn-primary">
            Start a new session
          </button>
        </div>
      </div>
    );
  }

  // No room joined yet (or the last attempt failed) — show the create/join
  // gate instead of the call stage.
  if (!call.roomId || !role) {
    return (
      <RoomGate
        status={call.status}
        errorMessage={call.errorMessage}
        prefillRoomId={routeRoomId}
        initialRole={role}
        displayName={displayName}
        onChangeDisplayName={setDisplayName}
        stream={call.localStream}
        cameraEnabled={call.cameraEnabled}
        micEnabled={call.micEnabled}
        onPrepareMedia={call.prepareLocalStream}
        onToggleCamera={call.toggleCamera}
        onToggleMicrophone={call.toggleMicrophone}
        onCreateRoom={(chosenRole, name) => {
          saveDisplayName(name);
          setRole(chosenRole);
          call.createRoom();
        }}
        onJoinRoom={(id, chosenRole, name) => {
          saveDisplayName(name);
          setRole(chosenRole);
          call.joinRoom(id);
        }}
      />
    );
  }

  const connection = CONNECTION_LABEL[call.status];
  const localTile = {
    stream: call.localStream,
    participantName: displayName || 'You',
    cameraEnabled: call.cameraEnabled,
    micEnabled: call.micEnabled,
    isLocal: true,
  };
  const remoteTile = {
    stream: call.remoteStream,
    participantName: remoteParticipant.displayName,
    cameraEnabled: remoteParticipant.cameraEnabled,
    micEnabled: remoteParticipant.micEnabled,
    isLocal: false,
  };
  const mainTile = tilesSwapped ? localTile : remoteTile;
  const secondaryTile = tilesSwapped ? remoteTile : localTile;

  return (
    <div
      ref={roomRef}
      className="flex h-screen flex-col overflow-hidden bg-room-bg supports-[height:100dvh]:h-dvh"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-room-border bg-room-surface/90 px-3 backdrop-blur-md sm:px-4">
        <div className="flex items-center gap-3">
          <Link to="/" className="room-icon-btn h-9 w-9" aria-label="Back to home" title="Back to home">
            <ArrowLeft size={16} />
          </Link>
          <div className="leading-tight">
            <p className="flex items-center gap-2 text-sm font-semibold text-room-text">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-voice text-[#1A1204]">
                <Hand size={13} strokeWidth={2.4} />
              </span>
              <span className="font-display text-base font-bold tracking-tight">Samvaad</span>
            </p>
            <p className="max-w-[36vw] truncate text-[11px] text-room-text-soft">
              Room {call.roomId} · {ROLE_LABEL[role]} · {displayName || 'Guest'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {(status === 'listening' || status === 'recognizing_signs' || status === 'speaking' || status === 'avatar_signing') && (
            <div className="hidden lg:block"><StatusBar status={status} /></div>
          )}
          {connection && (
            <span className="flex items-center gap-1.5 text-[11px] text-room-text-soft sm:text-xs">
              {call.status === 'connected' ? (
                <LockKeyhole size={12} className="text-signal" />
              ) : (
                <span className={`h-1.5 w-1.5 rounded-full ${connection.dot}`} />
              )}
              <span className="hidden sm:inline">{connection.label}</span>
            </span>
          )}
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-room-text-soft sm:text-xs" aria-label="Meeting duration">
            <Clock3 size={13} />
            <span className="sm:hidden">{formatDuration(elapsedSeconds, true)}</span>
            <span className="hidden sm:inline">{formatDuration(elapsedSeconds)}</span>
          </span>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            title="Settings"
            className="room-icon-btn h-9 w-9"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      <RoomStatusBanner
        status={call.status}
        roomId={call.roomId}
        errorMessage={call.errorMessage}
        role={role}
      />

      <div className="relative flex min-h-0 flex-1 gap-3 overflow-hidden bg-room-bg p-2 sm:p-3">
        <section className="relative min-h-0 min-w-0 flex-1">
        <RemoteVideoStage
          stream={mainTile.stream}
          audioStream={call.remoteStream}
          callStatus={call.status}
          errorMessage={call.errorMessage}
          speakerOn={speakerOn}
          participantName={mainTile.participantName}
          cameraEnabled={mainTile.cameraEnabled}
          micEnabled={mainTile.micEnabled}
          isLocal={mainTile.isLocal}
        />

        <LocalVideoPiP
          stream={secondaryTile.stream}
          participantName={secondaryTile.participantName}
          cameraEnabled={secondaryTile.cameraEnabled}
          micEnabled={secondaryTile.micEnabled}
          isLocal={secondaryTile.isLocal}
          onSwap={() => setTilesSwapped((swapped) => !swapped)}
        />

        {captionsOn && <CaptionOverlay caption={stageCaption} />}

        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-1 sm:bottom-4 sm:px-2">
          <div className="pointer-events-auto max-w-full">
            <CallControls
              micOn={call.micEnabled}
              cameraOn={call.cameraEnabled}
              speakerOn={speakerOn}
              captionsOn={captionsOn}
              sidebarOpen={sidebarOpen}
              showSignRecognition={role === 'isl'}
              recognizingSigns={recognizingSigns}
              showAvatar={role === 'isl'}
              avatarVisible={avatarVisible}
              onToggleMic={call.toggleMicrophone}
              onToggleCamera={call.toggleCamera}
              onToggleSpeaker={() => setSpeakerOn((v) => !v)}
              onToggleCaptions={() => setCaptionsOn((v) => !v)}
              onToggleSidebar={() => setSidebarOpen((v) => !v)}
              onReadSigns={() => {
                setSidebarOpen(true);
                setSidebarTab('tools');
                setRecognitionRequest((request) => request + 1);
              }}
              onToggleAvatar={() => {
                setAvatarVisible((visible) => !visible);
                setSidebarOpen(true);
                setSidebarTab('tools');
              }}
              onOpenKeyboard={() => setKeyboardOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
              onEndSession={handleEndSession}
              showKeyboard={role === 'hearing'}
              isFullscreen={isFullscreen}
              onToggleFullscreen={
                typeof document !== 'undefined' && document.fullscreenEnabled
                  ? toggleFullscreen
                  : undefined
              }
            />
          </div>
        </div>

        </section>

        <TranscriptDrawer
          isOpen={sidebarOpen}
          entries={entries}
          liveEntry={liveEntry}
          debugMode={debugMode}
          onClose={() => setSidebarOpen(false)}
          activeTab={sidebarTab}
          onChangeTab={setSidebarTab}
          toolsContent={(
            <div className="flex min-h-0 flex-1 flex-col">
              {role === 'isl' && avatarVisible && (
                <div className="h-48 shrink-0 border-b border-room-border">
                  <AvatarPanel
                    signs={avatar.signs}
                    isPlaying={avatar.isPlaying}
                    onPlaybackComplete={avatar.handlePlaybackComplete}
                    showQueue
                  />
                </div>
              )}
              {role === 'isl' ? (
                <>
                  <p className="px-4 py-3 text-xs text-room-text-soft">
                    Keep your face and hands in frame, then use Read signs to send a recognized sentence.
                  </p>
                  <CameraPanel
                    embedded
                    onNewSentence={handleIslSentence}
                    debugMode={debugMode}
                    stream={call.localStream}
                    cameraEnabled={call.cameraEnabled}
                    errorMessage={call.errorMessage}
                    receivedMessage={receivedMessage}
                    avatarSigning={avatar.isPlaying}
                    recognitionRequest={recognitionRequest}
                    onRecognitionStatusChange={setRecognizingSigns}
                  />
                </>
              ) : (
                <SpeechPanel
                  embedded
                  onSendToAvatar={handleSendToAvatar}
                  onLiveTranscript={handleLiveTranscript}
                  externalInput={externalInput}
                  debugMode={debugMode}
                  avatar={avatar}
                  receivedMessage={receivedMessage}
                />
              )}
            </div>
          )}
        />
      </div>

      {keyboardOpen && (
        <ManualTextInput
          onSubmit={(text) => setExternalInput({ text, nonce: Date.now() })}
          onClose={() => setKeyboardOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          debugMode={debugMode}
          onToggleDebugMode={() => setDebugMode((v) => !v)}
          displayName={displayName}
          onSaveDisplayName={saveDisplayName}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}