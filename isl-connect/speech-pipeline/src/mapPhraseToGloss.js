import mappingData from "./phraseToGloss.json" assert { type: "json" };

// text (lowercased) -> gloss sequence, or [] if no mapping exists.
// frontend should show a "sign not available" indicator on empty array.
export function mapPhraseToGloss(text) {
  const normalized = text.trim().toLowerCase();
  for (const entry of mappingData.mappings) {
    if (entry.phrases.includes(normalized)) {
      return entry.glossSequence;
    }
  }
  return [];
}
