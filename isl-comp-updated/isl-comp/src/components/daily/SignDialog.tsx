import { MessageSquarePlus, Star, VideoOff } from 'lucide-react';
import type { IslSign } from '../../data/islSigns';
import { Modal } from './Modal';
import { SignVideo } from './SignVideo';

interface SignDialogProps {
  sign: IslSign;
  favourite: boolean;
  onToggleFavourite: () => void;
  onUse: () => void;
  onClose: () => void;
}

export function SignDialog({ sign, favourite, onToggleFavourite, onUse, onClose }: SignDialogProps) {
  return (
    <Modal title={`Sign: ${sign.label}`} onClose={onClose}>
      <div className="space-y-4 p-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-mist">{sign.categoryLabel}</p>
          <p className="mt-1 text-3xl font-semibold text-cream">{sign.label}</p>
          <p className="mt-1 text-base text-mist">
            English gloss: <span className="font-medium text-cream">{sign.gloss}</span>. The catalog does not include a longer description.
          </p>
        </div>

        {sign.videoSrc ? (
          <SignVideo src={sign.videoSrc} label={sign.label} autoPlay />
        ) : (
          <div
            role="status"
            className="flex items-start gap-3 rounded-md border-2 border-dashed border-white/15 bg-white/[0.06] px-4 py-4 text-base text-cream"
          >
            <VideoOff size={22} className="mt-0.5 shrink-0 text-mist" />
            <p>
              <strong>No sign video is available for this sign yet.</strong> It is listed in the ISL catalog, but this app does not have a
              recording of it. You can still add its name to the conversation.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={onUse} className="btn-primary min-h-[52px] flex-1 px-5 text-base">
            <MessageSquarePlus size={19} /> Add to conversation
          </button>
          <button
            type="button"
            onClick={onToggleFavourite}
            aria-pressed={favourite}
            className={`btn-secondary min-h-[52px] px-4 text-base ${favourite ? 'border-voice text-voice-deep' : ''}`}
          >
            <Star size={19} className={favourite ? 'fill-current' : ''} />
            {favourite ? 'Favourite' : 'Add to favourites'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
