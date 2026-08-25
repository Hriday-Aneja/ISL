// Consumes { text, lang } from nlp-sentence-model (see /docs/CONTRACTS.md).
import React from "react";
export default function CaptionOverlay({ text, largeText = false }) {
  return (
    <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg ${largeText ? "text-2xl" : "text-base"}`}>
      {text || "..."}
    </div>
  );
}
