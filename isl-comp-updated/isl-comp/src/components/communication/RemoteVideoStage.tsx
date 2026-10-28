import { useEffect, useRef, useState } from 'react';
import { MicOff, UserX, WifiOff } from 'lucide-react';
import type { CallStatus } from '../../types/videoCall';

interface RemoteVideoStageProps {
  stream: MediaStream | null;
  audioStream?: MediaStream | null;
  callStatus: CallStatus;
  errorMessage?: string | null;
  speakerOn: boolean;
  participantName: string;
  cameraEnabled: boolean;
  micEnabled: boolean;
  isLocal?: boolean;
}

/**
 * The dominant visual in the Communication Room once a room exists: the
 * other person's real video/audio, filling the stage the way a call app's
 * main view does. Doesn't own any WebRTC logic — it just renders whatever
 * `stream` useVideoCall hands it and shows a state-appropriate placeholder
 * when there's nothing to show yet.
 */
export function RemoteVideoStage({
  stream,
  audioStream,
  callStatus,
  errorMessage,
  speakerOn,
  participantName,
  cameraEnabled,
  micEnabled,
  isLocal = false,
}: RemoteVideoStageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (el) {
      el.srcObject = stream;
      if (stream) {
        el.play().catch(() => {
          /* autoplay can be blocked; user can press play via controls */
        });
      }
    }
  }, [stream]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.srcObject = audioStream ?? null;
    if (audioStream && speakerOn && isLocal) {
      audio.play().catch(() => {});
    }
  }, [audioStream, speakerOn, isLocal]);

  const hasVideo = Boolean(stream) && cameraEnabled;
  const initials = participantName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-room-bg shadow-stage">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal || !speakerOn}
        className={`absolute inset-0 h-full w-full object-cover ${
          hasVideo ? 'opacity-100' : 'opacity-0'
        }`}
        style={isLocal ? { transform: 'scaleX(-1)' } : undefined}
      />
      <audio ref={audioRef} autoPlay muted={!isLocal || !speakerOn} />

      {!hasVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[radial-gradient(ellipse_at_center,_#23272B_0%,_#121416_78%)] px-6 text-center">
          {callStatus === 'peer_left' ? (
            <UserX size={32} className="text-voice" />
          ) : callStatus === 'connection_failed' ? (
            <WifiOff size={32} className="text-alert" />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-2xl font-semibold text-white/85">
              {initials}
            </span>
          )}
          <div>
            <p className="font-display text-lg font-medium text-white">{participantName || 'Waiting for participant'}</p>
            <p className="mt-1 max-w-xs text-sm text-white/55">
              {callStatus === 'peer_left'
                ? 'Your peer left the call.'
                : callStatus === 'connection_failed'
                  ? errorMessage || 'Connection lost.'
                  : !stream
                    ? callStatus === 'connecting' ? 'Connecting to video…' : 'Waiting for video…'
                    : 'Camera is off'}
            </p>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/75 to-transparent px-4 pb-4 pt-12">
        <span className="max-w-[75%] truncate rounded-full bg-black/45 backdrop-blur-sm px-2.5 py-1.5 text-sm font-medium text-white">
          {participantName || 'Participant'}{isLocal ? ' · You' : ''}
        </span>
        {!micEnabled && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-alert/80 text-white" title="Microphone muted">
            <MicOff size={15} />
          </span>
        )}
      </div>
    </div>
  );
}