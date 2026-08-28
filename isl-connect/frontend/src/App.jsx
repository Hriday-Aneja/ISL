import CaptionOverlay from "./components/CaptionOverlay";
import TranscriptPanel from "./components/TranscriptPanel";
import QuickPhrases from "./components/QuickPhrases";
import AvatarViewport from "./components/AvatarViewport";
import mockSentence from "../../integration/mock-data/mock_sentence_output.json";
import React from "react";
const animationMap = {
  "Hello": "hello",
  "Thank you": "thankyou",
  "Help": "help",
  "Water": "water",
  "Yes": "yes",
  "No": "no",
  "Sorry": "sorry",
};
export default function App() {
  return (
    <div className="h-screen w-screen bg-gray-50 p-4 grid grid-rows-[1fr_auto] gap-4">
      <div className="grid grid-cols-2 gap-4 relative">
        <div className="relative bg-black rounded-lg flex items-center justify-center text-white">
          Video call
          <CaptionOverlay text={mockSentence.text} largeText />
        </div>
        <AvatarViewport />
      </div>
      <div className="grid grid-cols-[1fr_2fr] gap-4 h-40">
        <QuickPhrases
  onSelect={(phrase) => {
    const anim =
      animationMap[phrase];

    if (
      anim &&
      window.playAvatarAnimation
    ) {
      window.playAvatarAnimation(anim);
    }
  }}
/>
<div className="flex gap-2 mt-2">
  <button
    className="bg-green-600 text-white px-4 py-2 rounded"
    onClick={() => {
      window.playSigns?.([
        "hello",
        "thankyou",
        "water",
      ]);
    }}
  >
    Test Queue
  </button>

  <button
    className="bg-blue-600 text-white px-4 py-2 rounded"
    onClick={() => {
      window.playSigns?.([
        "help",
        "yes",
        "sorry",
      ]);
    }}
  >
    Test Queue 2
  </button>
</div>
        <TranscriptPanel entries={[{ speaker: "ISL user", text: mockSentence.text, timestamp: Date.now() }]} />
      </div>
    </div>
  );
}
