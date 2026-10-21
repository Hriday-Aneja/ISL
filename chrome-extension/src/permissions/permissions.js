document.getElementById('go').addEventListener('click', async () => {
  const out = document.getElementById('out');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach((t) => t.stop());
    out.textContent = 'Camera access granted. Close this tab, return to your meeting and press Start recognition.';
  } catch (err) {
    out.textContent = err.name === 'NotAllowedError'
      ? 'Permission was denied. Click the camera icon in the address bar to allow it, or reset it in chrome://settings/content/camera.'
      : `Could not open the camera: ${err.name}. ${err.name === 'NotReadableError' ? 'Another app may be using it.' : ''}`;
  }
});
