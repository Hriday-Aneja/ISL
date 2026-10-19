import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  Captions,
  Keyboard,
  Settings,
  PhoneOff,
  Maximize,
  Minimize,
  PanelRight,
  PersonStanding,
  ScanFace,
} from 'lucide-react';

interface CallControlsProps {
  micOn: boolean;
  cameraOn: boolean;
  speakerOn: boolean;
  captionsOn: boolean;
  sidebarOpen: boolean;
  showSignRecognition: boolean;
  recognizingSigns: boolean;
  showAvatar: boolean;
  avatarVisible: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleSpeaker: () => void;
  onToggleCaptions: () => void;
  onToggleSidebar: () => void;
  onReadSigns: () => void;
  onToggleAvatar: () => void;
  onOpenKeyboard: () => void;
  onOpenSettings: () => void;
  onEndSession: () => void;
  /** The typed-message shortcut feeds the hearing user's speech pipeline, so
   * the ISL interface hides it. Defaults to shown. */
  showKeyboard?: boolean;
  /** Fullscreen toggle — only shown when a handler is provided (i.e. the
   * browser supports the Fullscreen API). */
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export function CallControls({
  micOn,
  cameraOn,
  speakerOn,
  captionsOn,
  sidebarOpen,
  showSignRecognition,
  recognizingSigns,
  showAvatar,
  avatarVisible,
  onToggleMic,
  onToggleCamera,
  onToggleSpeaker,
  onToggleCaptions,
  onToggleSidebar,
  onReadSigns,
  onToggleAvatar,
  onOpenKeyboard,
  onOpenSettings,
  onEndSession,
  showKeyboard = true,
  isFullscreen = false,
  onToggleFullscreen,
}: CallControlsProps) {
  return (
    <div className="flex max-w-full flex-wrap items-center justify-center gap-1 rounded-lg border border-white/10 bg-black/55 px-2 py-2 shadow-stage backdrop-blur-md sm:gap-2 sm:px-3 [&>button]:h-9 [&>button]:w-9 sm:[&>button]:h-11 sm:[&>button]:w-11">
      <button
        onClick={onToggleMic}
        aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
        aria-pressed={micOn}
        title={micOn ? 'Mute microphone' : 'Unmute microphone'}
        className={micOn ? 'room-icon-btn-active' : 'room-icon-btn'}
      >
        {micOn ? <Mic size={18} /> : <MicOff size={18} />}
      </button>

      <button
        onClick={onToggleCamera}
        aria-label={cameraOn ? 'Turn off camera' : 'Turn on camera'}
        aria-pressed={cameraOn}
        title={cameraOn ? 'Turn off camera' : 'Turn on camera'}
        className={cameraOn ? 'room-icon-btn-active' : 'room-icon-btn'}
      >
        {cameraOn ? <Video size={18} /> : <VideoOff size={18} />}
      </button>

      <button
        onClick={onToggleSpeaker}
        aria-label={speakerOn ? 'Mute speaker' : 'Unmute speaker'}
        aria-pressed={speakerOn}
        title={speakerOn ? 'Mute speaker' : 'Unmute speaker'}
        className={speakerOn ? 'room-icon-btn-active' : 'room-icon-btn'}
      >
        {speakerOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>

      <button
        onClick={onToggleCaptions}
        aria-label={captionsOn ? 'Hide live captions' : 'Show live captions'}
        aria-pressed={captionsOn}
        title={captionsOn ? 'Hide live captions' : 'Show live captions'}
        className={captionsOn ? 'room-icon-btn-active' : 'room-icon-btn'}
      >
        <Captions size={18} />
      </button>

      <button
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? 'Close transcript and tools' : 'Open transcript and tools'}
        aria-pressed={sidebarOpen}
        title={sidebarOpen ? 'Close transcript and tools' : 'Open transcript and tools'}
        className={sidebarOpen ? 'room-icon-btn-active' : 'room-icon-btn'}
      >
        <PanelRight size={18} />
      </button>

      {showSignRecognition && (
        <button
          onClick={onReadSigns}
          aria-label={recognizingSigns ? 'Reading signs' : 'Read signs'}
          aria-pressed={recognizingSigns}
          title={recognizingSigns ? 'Reading signs' : 'Read signs'}
          disabled={!cameraOn || recognizingSigns}
          className={recognizingSigns ? 'room-icon-btn-active' : 'room-icon-btn'}
        >
          <ScanFace size={18} />
        </button>
      )}

      {showAvatar && (
        <button
          onClick={onToggleAvatar}
          aria-label={avatarVisible ? 'Hide avatar tools' : 'Show avatar tools'}
          aria-pressed={avatarVisible}
          title={avatarVisible ? 'Hide avatar tools' : 'Show avatar tools'}
          className={avatarVisible ? 'room-icon-btn-active' : 'room-icon-btn'}
        >
          <PersonStanding size={18} />
        </button>
      )}

      {showKeyboard && (
        <button
          onClick={onOpenKeyboard}
          aria-label="Type a message"
          title="Type a message"
          className="room-icon-btn"
        >
          <Keyboard size={18} />
        </button>
      )}

      <button onClick={onOpenSettings} aria-label="Settings" title="Settings" className="room-icon-btn">
        <Settings size={18} />
      </button>

      {onToggleFullscreen && (
        <button
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          aria-pressed={isFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          className={isFullscreen ? 'room-icon-btn-active' : 'room-icon-btn'}
        >
          {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>
      )}

      <div className="mx-1 h-6 w-px bg-white/15 sm:mx-2" />

      <button
        onClick={onEndSession}
        aria-label="End session"
        title="End session"
        className="room-icon-btn-danger"
      >
        <PhoneOff size={18} />
      </button>
    </div>
  );
}
