// Browser-native speech-to-text via Web Speech API.
// Emits: { text, lang } per /docs/CONTRACTS.md

export function startListening(onResult, lang = "en-US") {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.error("Web Speech API not supported in this browser");
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = lang;

  recognition.onresult = (event) => {
    const text = event.results[event.results.length - 1][0].transcript;
    onResult({ text, lang: lang.startsWith("hi") ? "hi" : "en" });
  };

  recognition.start();
  return recognition;
}
