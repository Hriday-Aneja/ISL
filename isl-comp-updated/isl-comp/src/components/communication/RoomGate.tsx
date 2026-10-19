import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  Camera,
  CameraOff,
  Loader2,
  Mic,
  MicOff,
  Users,
  KeyRound,
  ScanFace,
} from 'lucide-react';
import type { CallStatus, UserRole } from '../../types/videoCall';

interface RoomGateProps {
  status: CallStatus;
  errorMessage: string | null;
  prefillRoomId?: string;
  /** Role already known (e.g. carried by an invite link) — preselected here. */
  initialRole?: UserRole | null;
  displayName: string;
  onChangeDisplayName: (name: string) => void;
  stream: MediaStream | null;
  cameraEnabled: boolean;
  micEnabled: boolean;
  onPrepareMedia: () => Promise<boolean>;
  onToggleCamera: () => void;
  onToggleMicrophone: () => void;
  onCreateRoom: (role: UserRole, displayName: string) => void;
  onJoinRoom: (roomId: string, role: UserRole, displayName: string) => void;
}

const BUSY_STATUSES: CallStatus[] = ['requesting_media', 'creating', 'joining'];

const BUSY_LABEL: Partial<Record<CallStatus, string>> = {
  requesting_media: 'Requesting camera & microphone access…',
  creating: 'Creating your room…',
  joining: 'Joining room…',
};

/**
 * Shown before the two-person call is connected: create a new room or join
 * one by ID/link. Once a room exists (status moves to 'waiting' or beyond)
 * CommunicationRoom swaps this out for the real call UI.
 */
export function RoomGate({
  status,
  errorMessage,
  prefillRoomId,
  initialRole = null,
  displayName,
  onChangeDisplayName,
  stream,
  cameraEnabled,
  micEnabled,
  onPrepareMedia,
  onToggleCamera,
  onToggleMicrophone,
  onCreateRoom,
  onJoinRoom,
}: RoomGateProps) {
  const [role, setRole] = useState<UserRole | null>(initialRole);
  const [tab, setTab] = useState<'create' | 'join'>(prefillRoomId ? 'join' : 'create');
  const [roomIdInput, setRoomIdInput] = useState(prefillRoomId ?? '');
  const [step, setStep] = useState<'room' | 'prejoin'>('room');
  const [preparingMedia, setPreparingMedia] = useState(false);
  const previewRef = useRef<HTMLVideoElement | null>(null);

  const busy = BUSY_STATUSES.includes(status);

  useEffect(() => {
    const video = previewRef.current;
    if (video && stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }
  }, [stream]);

  const prepareMedia = async () => {
    if (preparingMedia) return;
    setPreparingMedia(true);
    try {
      await onPrepareMedia();
    } finally {
      setPreparingMedia(false);
    }
  };

  const continueToPrejoin = () => {
    if (!role || (tab === 'join' && !roomIdInput.trim())) return;
    setStep('prejoin');
    void prepareMedia();
  };

  const joinCall = () => {
    const cleanName = displayName.trim().slice(0, 40);
    if (!role || !cleanName) return;
    if (tab === 'create') onCreateRoom(role, cleanName);
    else onJoinRoom(roomIdInput, role, cleanName);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-room-bg px-6 py-16 text-center">
      <Link
        to="/"
        className="room-icon-btn absolute left-4 top-4 h-9 w-9"
        aria-label="Back to home"
        title="Back to home"
      >
        <ArrowLeft size={16} />
      </Link>

      <div className={`w-full text-left ${step === 'prejoin' ? 'max-w-5xl' : 'max-w-sm'}`}>
        <div className="mb-5 text-center">
          <div className="mb-3 inline-flex items-center gap-2.5 text-room-text">
            <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-signal text-white">
              <ScanFace size={18} />
            </span>
            <span className="font-display text-lg font-semibold">SAMVAAD</span>
          </div>
          <h1 className="font-display text-2xl font-semibold text-room-text">
            {step === 'prejoin' ? 'Ready to join?' : 'Communication Room'}
          </h1>
          {step === 'room' && (
            <p className="mt-2 text-sm text-room-text-soft">
              Choose your role and set up the room for a live sign and speech conversation.
            </p>
          )}
        </div>

        {errorMessage && (
          <div className="mb-4 flex items-start gap-2 rounded-sm border border-alert/40 bg-alert/10 px-3.5 py-3 text-left text-sm text-[#ff9a90]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="rounded-md border border-room-border bg-room-surface p-5 shadow-stage sm:p-6">
          {busy ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Loader2 size={22} className="animate-spin text-room-text-soft" />
              <p className="text-sm text-room-text-soft">{BUSY_LABEL[status]}</p>
            </div>
          ) : step === 'prejoin' ? (
            <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr] md:items-center">
              <div className="relative aspect-video overflow-hidden rounded-sm border border-white/10 bg-black">
                <video
                  ref={previewRef}
                  autoPlay
                  playsInline
                  muted
                  className={`h-full w-full object-cover ${cameraEnabled && stream ? 'opacity-100' : 'opacity-0'}`}
                  style={{ transform: 'scaleX(-1)' }}
                />
                {(!stream || !cameraEnabled) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-room-raised text-room-text-soft">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-2xl font-semibold text-white">
                      {displayName.trim().slice(0, 1).toUpperCase() || '?'}
                    </span>
                    <span className="text-sm">{stream ? 'Camera is off' : 'Camera preview unavailable'}</span>
                  </div>
                )}
                <span className="absolute bottom-3 left-3 rounded-sm bg-black/55 px-2.5 py-1 text-xs text-white">
                  {displayName.trim() || 'You'}
                </span>
                <div className="absolute bottom-2 right-2 flex gap-2">
                  <button
                    type="button"
                    onClick={onToggleMicrophone}
                    aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
                    aria-pressed={micEnabled}
                    className={micEnabled ? 'room-icon-btn h-9 w-9' : 'room-icon-btn-danger h-9 w-9'}
                  >
                    {micEnabled ? <Mic size={16} /> : <MicOff size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={onToggleCamera}
                    aria-label={cameraEnabled ? 'Turn off camera' : 'Turn on camera'}
                    aria-pressed={cameraEnabled}
                    className={cameraEnabled ? 'room-icon-btn h-9 w-9' : 'room-icon-btn-danger h-9 w-9'}
                  >
                    {cameraEnabled ? <Camera size={16} /> : <CameraOff size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <label htmlFor="display-name" className="mb-1.5 block text-sm font-medium text-room-text">
                    Your name
                  </label>
                  <input
                    id="display-name"
                    autoComplete="name"
                    maxLength={40}
                    value={displayName}
                    onChange={(event) => onChangeDisplayName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') joinCall();
                    }}
                    placeholder="Enter your name"
                    className="w-full rounded-sm border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm text-room-text placeholder:text-room-text-soft/60 focus:border-signal/50 focus:outline-none"
                  />
                </div>
                <p className="text-xs text-room-text-soft">
                  {role === 'isl' ? 'Joining as ISL User' : 'Joining as Hearing User'}
                  {tab === 'join' && ` · Room ${roomIdInput.trim().toUpperCase()}`}
                </p>
                {!stream && (
                  <button type="button" onClick={() => void prepareMedia()} disabled={preparingMedia} className="btn-room-secondary w-full">
                    {preparingMedia ? 'Requesting camera access…' : 'Enable camera preview'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={joinCall}
                  disabled={!displayName.trim() || busy || preparingMedia}
                  className="btn-primary w-full py-3"
                >
                  Join Call
                </button>
                <button
                  type="button"
                  onClick={() => setStep('room')}
                  className="text-sm text-room-text-soft hover:text-room-text"
                >
                  Back to room setup
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-room-text-soft">
                I am joining as
              </p>
              <div className="mb-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Choose your role">
                {(
                  [
                    { value: 'isl', label: 'ISL User', hint: 'I sign', Icon: ScanFace },
                    { value: 'hearing', label: 'Hearing User', hint: 'I speak', Icon: Mic },
                  ] as const
                ).map(({ value, label, hint, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={role === value}
                    onClick={() => setRole(value)}
                    className={`flex flex-col items-center gap-1 rounded-sm border px-3 py-3 text-sm font-medium transition-colors ${
                      role === value
                        ? 'border-signal/50 bg-signal/15 text-room-text'
                        : 'border-white/10 bg-white/[0.04] text-room-text-soft hover:text-room-text'
                    }`}
                  >
                    <Icon size={18} />
                    {label}
                    <span className="text-xs font-normal text-room-text-soft">{hint}</span>
                  </button>
                ))}
              </div>

              <div className="mb-4 flex gap-1 rounded-sm bg-white/[0.04] p-1">
                <button
                  onClick={() => setTab('create')}
                  className={`flex-1 rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
                    tab === 'create'
                      ? 'bg-white/[0.08] text-room-text'
                      : 'text-room-text-soft hover:text-room-text'
                  }`}
                >
                  Create room
                </button>
                <button
                  onClick={() => setTab('join')}
                  className={`flex-1 rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
                    tab === 'join'
                      ? 'bg-white/[0.08] text-room-text'
                      : 'text-room-text-soft hover:text-room-text'
                  }`}
                >
                  Join room
                </button>
              </div>

              {tab === 'create' ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-sm text-room-text-soft">
                    <Users size={15} />
                    Start a new room and share the ID or link with the other person.
                  </div>
                  {!role && <p className="text-xs text-room-text-soft">Choose your role above to continue.</p>}
                  <button
                    onClick={continueToPrejoin}
                    disabled={!role}
                    className="btn-primary w-full"
                  >
                    Continue
                  </button>
                </div>
              ) : (
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    continueToPrejoin();
                  }}
                >
                  <div className="flex items-center gap-2 text-sm text-room-text-soft">
                    <KeyRound size={15} />
                    Enter the room ID you were given, or open the shared link directly.
                  </div>
                  {!role && <p className="text-xs text-room-text-soft">Choose your role above to continue.</p>}
                  <input
                    value={roomIdInput}
                    onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
                    placeholder="ROOM ID"
                    autoFocus={Boolean(prefillRoomId)}
                    className="w-full rounded-sm border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-center font-mono text-sm uppercase tracking-[0.2em] text-room-text placeholder:text-room-text-soft/60 focus:border-signal/50 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!roomIdInput.trim() || !role}
                    className="btn-primary w-full"
                  >
                    Continue
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
