// onSelect(phrase) should feed the same path as typed/spoken text into
// speech-pipeline's mapPhraseToGloss().
import React from "react";
const DEFAULT_PHRASES = ["Hello", "Thank you", "Help", "Water", "Yes", "No", "Sorry"];

export default function QuickPhrases({ phrases = DEFAULT_PHRASES, onSelect }) {
  return (
    <div className="flex flex-wrap gap-2 p-2">
      {phrases.map((phrase) => (
        <button
          key={phrase}
          onClick={() => onSelect(phrase)}
          className="px-3 py-1 bg-indigo-600 text-white rounded-full text-sm hover:bg-indigo-700"
        >
          {phrase}
        </button>
      ))}
    </div>
  );
}
