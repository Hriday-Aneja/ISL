import type { LucideIcon } from 'lucide-react';
import {
  Code2,
  Mic,
  MessageCircle,
  Type,
  Video,
  Waypoints,
} from 'lucide-react';

export type HeroFeature = {
  id: string;
  label: string;
  title: string;
  category: string;
  subtitle: string;
  description: string;
  visual: 'dialogue' | 'recognition' | 'speech-sign' | 'captions' | 'room' | 'technology';
  icon: LucideIcon;
};

export type HeroDiscovery = {
  id: string;
  category: string;
  title: string;
  description: string;
};

export const HERO_FEATURES: HeroFeature[] = [
  {
    id: 'overview',
    label: 'Enter the Dialogue',
    title: 'Every conversation deserves a way forward',
    category: 'SAMVAAD · Project introduction',
    subtitle: 'Sign, speech, and text can share one conversation.',
    description:
      'SAMVAAD explores more inclusive communication by bringing Indian Sign Language and hearing users together through a browser-based prototype.',
    visual: 'dialogue',
    icon: MessageCircle,
  },
  {
    id: 'recognition',
    label: 'When Hands Speak',
    title: 'A gesture-to-meaning workflow',
    category: 'Sign recognition · In development',
    subtitle: 'An illustrative look at the recognition journey.',
    description:
      'The prototype includes a recognition adapter, while its trained sign-recognition model is still being integrated. This visual is illustrative—not a live recognition result.',
    visual: 'recognition',
    icon: Waypoints,
  },
  {
    id: 'speech-sign',
    label: 'Voice Becomes Sign',
    title: 'From a phrase to sign clips',
    category: 'Speech-to-sign · Phrase mapping',
    subtitle: 'A visual explanation of phrase mapping.',
    description:
      'Spoken or typed phrases can map to sign IDs and available clips. The complete 3D signing-avatar renderer is not yet available; this waveform-to-sign motif is illustrative.',
    visual: 'speech-sign',
    icon: Mic,
  },
  {
    id: 'captions',
    label: 'Words Without Barriers',
    title: 'A text path through conversation',
    category: 'Captions · Text',
    subtitle: 'An illustrative caption, not live audio.',
    description:
      'The prototype includes speech transcripts and typed replies. Sign-caption output depends on the recognizer still in development, so the caption preview here is sample content.',
    visual: 'captions',
    icon: Type,
  },
  {
    id: 'room',
    label: 'Meet in the Middle',
    title: 'A shared browser communication room',
    category: 'Communication room',
    subtitle: 'A place for two participants to connect.',
    description:
      'The existing room supports a two-person call with camera, microphone, and peer-to-peer audio/video. The indicators below are illustrative; start a conversation to use the room.',
    visual: 'room',
    icon: Video,
  },
  {
    id: 'technology',
    label: 'Behind the Magic',
    title: 'A browser-based toolkit',
    category: 'Technology · In the project',
    subtitle: 'The tools and protocols behind SAMVAAD.',
    description:
      'The web app is built with React, TypeScript, Vite, and Tailwind CSS. WebRTC carries call media, with Socket.IO used for signaling.',
    visual: 'technology',
    icon: Code2,
  },
];

export const HERO_DISCOVERIES: HeroDiscovery[] = [
  {
    id: 'project-prototype',
    category: 'SAMVAAD project',
    title: 'A prototype with clear next steps',
    description:
      'The project documentation marks the trained sign-recognition model and full 3D avatar renderer as still in development.',
  },
  {
    id: 'project-room',
    category: 'SAMVAAD project',
    title: 'Media stays peer to peer',
    description:
      'In the communication room, WebRTC carries the call media between participants; Socket.IO is used for signaling.',
  },
  {
    id: 'project-mapping',
    category: 'SAMVAAD project',
    title: 'One vocabulary across the flow',
    description:
      'A shared set of sign IDs connects phrase mapping, recognition interfaces, and avatar playback.',
  },
  {
    id: 'project-meet',
    category: 'SAMVAAD project',
    title: 'Beyond the standalone room',
    description:
      'The project also documents a Chrome extension for Google Meet, with sign captions and speech-to-sign tools.',
  },
  {
    id: 'accessibility-language',
    category: 'Accessibility insight',
    title: 'Sign languages are languages',
    description:
      'Sign languages have their own grammar and can vary across communities; they are not simply signed versions of spoken languages.',
  },
  {
    id: 'accessibility-options',
    category: 'Accessibility insight',
    title: 'Choice supports communication',
    description:
      'Offering sign, speech, captions, and text lets people choose the communication mode that works for them.',
  },
  {
    id: 'accessibility-captions',
    category: 'Accessibility insight',
    title: 'Captions add a text path',
    description:
      'Captions make spoken content available in written form, offering another way to follow a conversation.',
  },
  {
    id: 'technology-web',
    category: 'Technology insight',
    title: 'A browser-based toolkit',
    description:
      "React, TypeScript, Vite, and Tailwind CSS are the core tools listed for SAMVAAD's web interface.",
  },
];
