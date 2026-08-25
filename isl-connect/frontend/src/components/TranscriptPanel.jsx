// entries: [{ speaker: "ISL user" | "Hearing user", text: string, timestamp: number }]
import React from "react";
export default function TranscriptPanel({ entries = [] }) {
  return (
    <div className="w-full h-full overflow-y-auto p-3 bg-white/90 rounded-lg">
      <h3 className="font-semibold mb-2">Transcript</h3>
      {entries.map((entry, i) => (
        <p key={i} className="text-sm mb-1">
          <span className="font-medium">{entry.speaker}:</span> {entry.text}
        </p>
      ))}
    </div>
  );
}
