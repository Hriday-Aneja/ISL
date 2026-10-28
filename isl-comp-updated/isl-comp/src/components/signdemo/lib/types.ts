/** A normalised image-space point: x and y in 0..1 (MediaPipe convention). */
export type Pt = [number, number];

/**
 * Landmarks for one video frame. Arrays follow MediaPipe indexing:
 *  - pose: 33 points (we only draw the upper-body ones)
 *  - left_hand / right_hand: 21 points each, or [] when that hand was not detected
 * "left"/"right" are the signer's own hands (so the signer's right hand appears on the
 * LEFT of an un-mirrored frame), exactly as MediaPipe Holistic reports them.
 */
export interface FrameLandmarks {
  pose: Pt[];
  left_hand: Pt[];
  right_hand: Pt[];
}

export interface Prediction {
  label: string;
  p: number;
}

/** The JSON shape served from /public/demo/<sign>.json */
export interface SignClip {
  sign: string;
  /** Path to the recorded clip, or null when there is no video for this sign yet. */
  video: string | null;
  fps: number;
  frames: FrameLandmarks[];
  /** Top predictions, highest first. Only the first three are shown. */
  predictions: Prediction[];
}

export interface LoadedClip extends SignClip {
  /** true when the data was generated in the browser instead of exported from the model. */
  isMock: boolean;
}

export interface RecognitionResult {
  label: string;
  confidence: number;
}
