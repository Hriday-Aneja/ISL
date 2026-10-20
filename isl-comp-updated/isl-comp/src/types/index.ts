// Shared vocabulary of sign IDs. Kept as a union of string literals so that
// recognition, mapping, and avatar-playback modules all speak the same
// language. Extend this list — and the label map in data/signMappings.ts —
// as vocabulary grows.
export type SignId =
  | 'HELLO'
  | 'THANK_YOU'
  | 'PLEASE'
  | 'SORRY'
  | 'YES'
  | 'NO'
  | 'I'
  | 'YOU'
  | 'MY'
  | 'YOUR'
  | 'NEED'
  | 'WATER'
  | 'FOOD'
  | 'HELP'
  | 'DOCTOR'
  | 'DAUGHTER'
  | 'HAPPY'
  | 'HOUSE'
  | 'LAWYER'
  | 'PARENT'
  | 'SAD'
  | 'STUDENT'
  | 'TEACHER'
  | 'TEACHERS'
  | 'TRAIN_STATION'
  | 'WAITER'
  | 'EMERGENCY'
  | 'PAIN'
  | 'STOP'
  | 'GOODBYE'
  | 'FINE'
  | 'WHERE'
  | 'WASHROOM'
  | 'NAME'
  | 'HOW'
  | 'ME';

export type SessionStatus =
  | 'ready'
  | 'camera_active'
  | 'listening'
  | 'recognizing_signs'
  | 'translation_ready'
  | 'speaking'
  | 'avatar_signing';

export type Speaker = 'isl_user' | 'hearing_user';

export interface ConversationEntry {
  id: string;
  speaker: Speaker;
  speakerName?: string;
  text: string;
  signs?: SignId[];
  timestamp: number;
}

export interface CameraState {
  status: 'idle' | 'requesting' | 'active' | 'error' | 'stopped';
  errorMessage?: string;
  stream: MediaStream | null;
}

export interface SpeechRecognitionState {
  status: 'idle' | 'listening' | 'error' | 'unsupported';
  interimTranscript: string;
  finalTranscript: string;
  errorMessage?: string;
}

export interface TextToSpeechState {
  status: 'idle' | 'speaking' | 'unsupported';
}

// The contract the future 3D avatar module must implement. The mock
// component below satisfies this exact prop shape today.
export interface AvatarProps {
  signs: SignId[];
  isPlaying?: boolean;
  onPlaybackComplete?: () => void;
}

// The contract the future recognition model must implement. The mock
// adapter in services/mockRecognition.ts satisfies this shape today,
// consuming a video frame/element and resolving to a sign sequence.
export interface RecognitionResult {
  signs: SignId[];
  confidence: number;
}
