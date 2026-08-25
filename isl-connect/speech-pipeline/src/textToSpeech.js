// Browser-native text-to-speech via Web Speech API.
// Consumes: { text, lang } from nlp-sentence-model

export function speak({ text, lang = "en" }) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === "hi" ? "hi-IN" : "en-US";
  window.speechSynthesis.speak(utterance);
}
