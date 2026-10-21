const out = document.getElementById('out');

async function grant(constraints, noun, settingsPage) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getTracks().forEach((t) => t.stop());
    out.textContent = `${noun} access granted. Close this tab, return to your meeting and try again.`;
  } catch (err) {
    out.textContent = err.name === 'NotAllowedError'
      ? `Permission was denied. Click the ${noun.toLowerCase()} icon in the address bar to allow it, or reset it in chrome://settings/content/${settingsPage}.`
      : `Could not open the ${noun.toLowerCase()}: ${err.name}. ${err.name === 'NotReadableError' ? 'Another app may be using it.' : ''}`;
  }
}

document.getElementById('go').addEventListener('click', () => grant({ video: true, audio: false }, 'Camera', 'camera'));
document.getElementById('goMic').addEventListener('click', () => grant({ audio: true, video: false }, 'Microphone', 'microphone'));
