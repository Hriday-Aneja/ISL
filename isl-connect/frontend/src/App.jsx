import CaptionOverlay from "./components/CaptionOverlay";
import TranscriptPanel from "./components/TranscriptPanel";
import QuickPhrases from "./components/QuickPhrases";
import AvatarViewport from "./components/AvatarViewport";
import mockSentence from "../../integration/mock-data/mock_sentence_output.json";
import React from "react";

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
        <QuickPhrases onSelect={(phrase) => console.log("selected:", phrase)} />
        <TranscriptPanel entries={[{ speaker: "ISL user", text: mockSentence.text, timestamp: Date.now() }]} />
      </div>
    </div>
  );
}
