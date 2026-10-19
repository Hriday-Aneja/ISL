import type { RecognitionResult } from '../types';
import { MOCK_SIGN_SEQUENCES } from '../data/mockData';

/**
 * MOCK ADAPTER — stands in for the real recognition model.
 *
 * Integration point: replace this function's body with a call to the
 * teammate's trained model, e.g.
 *
 *   export async function recognizeSignsFromModel(
 *     frame: ImageData | HTMLVideoElement
 *   ): Promise<RecognitionResult> { ... }
 *
 * Every caller in this codebase (see CameraPanel.tsx) only depends on the
 * `(frame?) => Promise<RecognitionResult>` shape below, so swapping the
 * implementation requires no changes anywhere else.
 */
export async function mockRecognizeSigns(
  _frame?: HTMLVideoElement | null
): Promise<RecognitionResult> {
  // Simulate model inference latency.
  await new Promise((resolve) => setTimeout(resolve, 1400 + Math.random() * 700));

  const signs =
    MOCK_SIGN_SEQUENCES[Math.floor(Math.random() * MOCK_SIGN_SEQUENCES.length)];

  return {
    signs,
    confidence: 0.82 + Math.random() * 0.15,
  };
}
