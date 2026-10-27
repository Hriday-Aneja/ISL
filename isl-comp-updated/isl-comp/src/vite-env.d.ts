/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Socket.IO signaling server used for WebRTC call setup. */
  readonly VITE_SIGNALING_SERVER_URL?: string;
  /** Base URL of the backend that serves /api/daily/* (defaults to the signaling server). */
  readonly VITE_API_BASE_URL?: string;
  /** WebSocket URL of include-ml/recognition_service.py (defaults to ws://127.0.0.1:8765). */
  readonly VITE_RECOGNITION_SERVICE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}