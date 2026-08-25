# avatar — 3D ISL Avatar (Person 4)

Gloss sequence -> queued sign animations on a rigged 3D avatar.

## Scope
- Rigged 3D avatar in Three.js (Ready Player Me + Mixamo, or simpler rig)
- Animation clips for the MVP subset in `shared/vocabulary.json` -> `avatarPriorityMVP`
  (5-10 signs, not the full vocabulary — animation production is the real bottleneck)
- Playback queue: `playSigns(glossSequence)` plays clips in order with smooth transitions

## Start immediately
1. `src/AvatarViewer.jsx` — get a rigged avatar rendering, demoable before any animations exist
2. `src/playSigns.js` — build the queue against a hardcoded test array, independent of Person 3

## Deliverables
- Rendered rigged avatar
- Animation clips for the MVP priority subset
- Working `playSigns(glossArray)`

## Interface exposed (see /docs/CONTRACTS.md)
```js
playSigns(["HELLO", "THANK_YOU", "WATER"])
```

## Hour 6 checkpoint
Avatar rendering live; playback queue working on a hardcoded test array;
at least a few signs animated.

## Final checkpoint
MVP priority subset fully animated with smooth transitions; wired to
speech-pipeline's real gloss-mapping output instead of the test array.

## Note
Put actual `.glb`/`.fbx` animation clips in `animations/` — they're
gitignored (binary/large), so make sure the team has a shared drive/drop
for the actual asset files.
