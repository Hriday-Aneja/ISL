// Playback queue: takes a gloss sequence, plays the matching animation
// clip for each gloss in order, dispatches onPlaybackComplete when done.
// Test with a hardcoded array first — no dependency on speech-pipeline
// to start building this.

let isPlaying = false;

export async function playSigns(glossSequence, { avatarMixer, clipLibrary, onPlaybackComplete } = {}) {
  if (isPlaying) return;
  isPlaying = true;

  for (const gloss of glossSequence) {
    const clip = clipLibrary?.[gloss];
    if (!clip) {
      console.warn(`No animation clip for gloss: ${gloss}`);
      continue;
    }
    await playClip(avatarMixer, clip);
  }

  isPlaying = false;
  onPlaybackComplete?.();
}

function playClip(mixer, clip) {
  return new Promise((resolve) => {
    if (!mixer || !clip) return resolve();
    const action = mixer.clipAction(clip);
    action.reset().play();
    setTimeout(resolve, clip.duration * 1000);
  });
}
