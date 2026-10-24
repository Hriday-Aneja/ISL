// Minimal WebRTC signaling server for ISL Bridge.
//
// This server does exactly one thing: help two browsers find each other and
// exchange the SDP offers/answers + ICE candidates needed to set up a
// direct peer-to-peer WebRTC connection. It never sees the resulting
// audio/video, and it contains no ISL/recognition/application logic —
// that all stays in the frontend.
//
// Rooms are capped at 2 participants (see MAX_PEERS_PER_ROOM).

import express from 'express';

// Optional local config. Reads server/.env (git-ignored) if present, so
// ANTHROPIC_API_KEY never has to be typed into a shell history or committed.
// Real environment variables always win over the file.
try {
  process.loadEnvFile(new URL('./.env', import.meta.url));
} catch {
  /* no .env file — that's fine */
}

import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createDailyRouter } from './dailySuggest.js';

const PORT = process.env.PORT || 4000;
const MAX_PEERS_PER_ROOM = 2;
const ROOM_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion

const app = express();
app.use(cors());
app.get('/health', (_req, res) => res.json({ ok: true }));

// Daily Translator: AI "More suggestions". The API key stays on this server.
app.use('/api/daily', createDailyRouter());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

/** @type {Map<string, Set<string>>} roomId -> set of socket ids */
const rooms = new Map();
/** @type {Map<string, string>} socket id -> roomId, for disconnect cleanup */
const socketRoom = new Map();

function generateRoomId() {
  let id;
  do {
    id = Array.from({ length: 6 }, () => ROOM_ID_ALPHABET[Math.floor(Math.random() * ROOM_ID_ALPHABET.length)]).join('');
  } while (rooms.has(id));
  return id;
}

function leaveCurrentRoom(socket) {
  const roomId = socketRoom.get(socket.id);
  if (!roomId) return;

  socket.leave(roomId);
  socketRoom.delete(socket.id);

  const members = rooms.get(roomId);
  if (members) {
    members.delete(socket.id);
    if (members.size === 0) {
      rooms.delete(roomId);
    } else {
      socket.to(roomId).emit('peer-left', { peerId: socket.id });
    }
  }
}

io.on('connection', (socket) => {
  socket.on('create-room', (_payload, callback) => {
    const roomId = generateRoomId();
    rooms.set(roomId, new Set([socket.id]));
    socketRoom.set(socket.id, roomId);
    socket.join(roomId);
    callback?.({ ok: true, roomId });
  });

  socket.on('join-room', ({ roomId }, callback) => {
    const id = String(roomId || '').toUpperCase();
    const members = rooms.get(id);

    if (!members) {
      callback?.({ ok: false, error: 'not-found' });
      return;
    }
    if (members.size >= MAX_PEERS_PER_ROOM) {
      callback?.({ ok: false, error: 'full' });
      return;
    }

    const existingPeerId = [...members][0];
    members.add(socket.id);
    socketRoom.set(socket.id, id);
    socket.join(id);

    callback?.({ ok: true, roomId: id, peerId: existingPeerId });
    socket.to(id).emit('peer-joined', { peerId: socket.id });
  });

  socket.on('leave-room', () => {
    leaveCurrentRoom(socket);
  });

  // Relay-only signaling — the payload shape is opaque to the server.
  socket.on('offer', ({ roomId, target, description }) => {
    io.to(target).emit('offer', { from: socket.id, roomId, description });
  });

  socket.on('answer', ({ roomId, target, description }) => {
    io.to(target).emit('answer', { from: socket.id, roomId, description });
  });

  socket.on('ice-candidate', ({ roomId, target, candidate }) => {
    io.to(target).emit('ice-candidate', { from: socket.id, roomId, candidate });
  });

  socket.on('disconnect', () => {
    leaveCurrentRoom(socket);
  });
});

httpServer.listen(PORT, () => {
  console.log(`ISL Bridge signaling server listening on http://localhost:${PORT}`);
});
