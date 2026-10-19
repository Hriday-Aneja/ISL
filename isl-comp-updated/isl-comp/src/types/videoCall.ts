// Types for the real two-person video-calling layer. Kept separate from
// types/index.ts (the ISL/speech domain types) since this is a distinct
// concern — the call layer just moves audio/video between two browsers.

import type { SignId } from './index';

/** Which side of the conversation this browser is on. Each role gets its own
 * Communication Room interface. */
export type UserRole = 'isl' | 'hearing';

export const ROLE_LABEL: Record<UserRole, string> = {
  isl: 'ISL User',
  hearing: 'Hearing User',
};

export function oppositeRole(role: UserRole): UserRole {
  return role === 'isl' ? 'hearing' : 'isl';
}

/** Messages sent over the call's data channel. Live speech carries caption
 * updates; finished speech/sign messages may also include signs for playback. */
export type PeerMessage =
  | { type: 'sign' | 'speech'; text: string; signs: SignId[] }
  | { type: 'speech-live'; text: string }
  | {
      type: 'peer-meta';
      displayName: string;
      micEnabled: boolean;
      cameraEnabled: boolean;
    };

/** Lifecycle of the local peer inside a room. */
export type CallStatus =
  | 'idle' // not in a room yet — showing the create/join gate
  | 'requesting_media' // asking the browser for camera/mic permission
  | 'creating' // asking the server to create a room
  | 'joining' // asking the server to join an existing room
  | 'waiting' // in a room alone, waiting for the other person
  | 'connecting' // peer present, WebRTC offer/answer/ICE in progress
  | 'connected' // media flowing both ways
  | 'peer_left' // the other person disconnected; still holding the room
  | 'ended' // the local user ended the call on purpose
  | 'room_full' // the room already has two people
  | 'room_not_found' // joined a room ID that doesn't exist (or expired)
  | 'permission_denied' // getUserMedia was denied
  | 'no_device' // no camera/microphone present
  | 'connection_failed'; // ICE/signaling failed to establish a connection

export interface CallError {
  status: CallStatus;
  message: string;
}

// ---- Signaling payloads exchanged with the Socket.IO server ----
// The server only ever relays these — it never inspects audio/video and
// carries no application (ISL) logic of its own.

export interface JoinAck {
  ok: boolean;
  roomId?: string;
  /** Present if another peer is already waiting in the room. */
  peerId?: string;
  error?: 'full' | 'not-found';
}

export interface PeerJoinedPayload {
  peerId: string;
}

export interface PeerLeftPayload {
  peerId: string;
}

export interface SignalPayload {
  from: string;
  roomId: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}
