import { useState } from 'react';
import { Copy, Check, Link2, Loader2, UserX, WifiOff } from 'lucide-react';
import { oppositeRole, type CallStatus, type UserRole } from '../../types/videoCall';

interface RoomStatusBannerProps {
  status: CallStatus;
  roomId: string | null;
  errorMessage: string | null;
  /** This user's role — the invite link carries the opposite one, so whoever
   * opens it lands directly in the other interface. */
  role?: UserRole | null;
}

/** Invite link for a room; carries the opposite role so the joiner lands in
 * the other interface. */
export function buildInviteLink(roomId: string, role?: UserRole | null): string {
  return `${window.location.origin}${window.location.pathname}#/room/${roomId}${
    role ? `?role=${oppositeRole(role)}` : ''
  }`;
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    } catch {
      /* clipboard API unavailable — silently ignore, ID is still visible */
    }
  };
  return { copied, copy };
}

/**
 * Slim strip under the top bar for everything that isn't "connected": share
 * the room, wait for a peer, or show a recoverable connection problem. The
 * camera/speech panels stay visible and usable underneath it — this never
 * takes over the whole screen.
 */
export function RoomStatusBanner({ status, roomId, errorMessage, role }: RoomStatusBannerProps) {
  const { copied, copy } = useCopy();

  if (status === 'connected') return null;

  const inviteLink = roomId ? buildInviteLink(roomId, role) : '';

  if (status === 'waiting' || status === 'peer_left') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-room-border bg-room-surface px-4 py-2.5 text-sm">
        <div className="flex items-center gap-2 text-room-text-soft">
          {status === 'peer_left' ? (
            <>
              <UserX size={15} className="text-voice" />
              Your peer left the call. Share the room again to reconnect.
            </>
          ) : (
            <>
              <Loader2 size={15} className="animate-spin" />
              Waiting for someone to join Room {roomId}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => roomId && copy('id', roomId)}
            className="room-icon-btn h-8 gap-1.5 px-3 text-xs font-medium"
          >
            {copied === 'id' ? <Check size={13} /> : <Copy size={13} />}
            {copied === 'id' ? 'Copied' : `Copy ID · ${roomId}`}
          </button>
          <button
            onClick={() => inviteLink && copy('link', inviteLink)}
            className="room-icon-btn h-8 gap-1.5 px-3 text-xs font-medium"
          >
            {copied === 'link' ? <Check size={13} /> : <Link2 size={13} />}
            {copied === 'link' ? 'Copied' : 'Copy invite link'}
          </button>
        </div>
      </div>
    );
  }

  if (status === 'connecting') {
    return (
      <div className="flex items-center gap-2 border-b border-room-border bg-room-surface px-4 py-2.5 text-sm text-room-text-soft">
        <Loader2 size={15} className="animate-spin text-signal" />
        Connecting to your peer…
      </div>
    );
  }

  if (status === 'connection_failed') {
    return (
      <div className="flex items-center gap-2 border-b border-alert/40 bg-alert/10 px-4 py-2.5 text-sm text-[#ff9a90]">
        <WifiOff size={15} />
        {errorMessage ?? 'Connection lost. Try ending and starting a new session.'}
      </div>
    );
  }

  return null;
}
