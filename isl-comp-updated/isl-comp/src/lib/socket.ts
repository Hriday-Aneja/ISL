import { io, type Socket } from 'socket.io-client';

// Single shared connection to the signaling server for the lifetime of the
// tab. The server (see /server) only relays room membership + WebRTC
// offer/answer/ICE messages — it never sees audio or video.
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const url = import.meta.env.VITE_SIGNALING_SERVER_URL || 'http://localhost:4000';
    socket = io(url, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}
