// Isolated-world half of the "show avatar to everyone" feature (classic script, loaded before content.js).
// The clips are played by the panel iframe (an extension page, so the meeting page's content-security policy cannot
// block them). The panel sends each video frame here as a transferred ImageBitmap through window.postMessage; this
// script paints it (or a text card) onto a hidden <canvas> and flips the data-samvaad-vcam flag that vcam-main.js reads.
// Frames are accepted only from the panel iframe's own window, never from the meeting page.
(function () {
  if (globalThis.SamvaadVcam) return;
  const W = 1280;
  const H = 720;
  const FPS = 30;
  const CANVAS_ID = 'samvaad-vcam-canvas';
  let enabled = false;
  let canvas = null;
  let ctx = null;
  let timer = null;
  let frame = null; // latest ImageBitmap from the panel
  let view = { kind: 'idle', label: '' }; // idle | clip | text | off

  function ensure() {
    if (canvas) return;
    canvas = document.getElementById(CANVAS_ID);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = CANVAS_ID;
      canvas.width = W;
      canvas.height = H;
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.cssText = 'position:fixed;left:-99999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;';
      document.documentElement.appendChild(canvas);
    }
    ctx = canvas.getContext('2d');
  }

  function dropFrame() {
    if (frame) { try { frame.close(); } catch { /* ignore */ } }
    frame = null;
  }

  function card(title, sub) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#16253d');
    g.addColorStop(1, '#0b1424');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 84px system-ui, sans-serif';
    ctx.fillText(title, W / 2, H / 2 + (sub ? 0 : 28), W - 120);
    if (sub) {
      ctx.fillStyle = '#9db4d6';
      ctx.font = '400 36px system-ui, sans-serif';
      ctx.fillText(sub, W / 2, H / 2 + 64, W - 120);
    }
  }

  function draw() {
    if (!ctx) return;
    if (view.kind === 'clip' && frame) {
      ctx.fillStyle = '#0b1424';
      ctx.fillRect(0, 0, W, H);
      const s = Math.min(W / frame.width, H / frame.height);
      const w = frame.width * s;
      const h = frame.height * s;
      ctx.drawImage(frame, (W - w) / 2, (H - h) / 2, w, h);
      if (view.label) { // caption so hearing participants can read what is being signed
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, H - 76, W, 76);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = '600 44px system-ui, sans-serif';
        ctx.fillText(view.label, W / 2, H - 24, W - 80);
      }
    } else if (view.kind === 'clip') card(view.label || '', '');
    else if (view.kind === 'text') card(view.label || '', 'no avatar clip for this sign yet');
    else if (view.kind === 'off') card('Avatar sharing stopped', 'turn your camera off and on again');
    else card('Samvaad', 'ISL avatar ready');
  }

  function fromPanel(ev) {
    const f = document.querySelector('#samvaad-panel-host iframe');
    return Boolean(f && f.contentWindow && ev.source === f.contentWindow);
  }

  addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || d.type !== 'samvaad-vcam-frame' || !d.bitmap) return;
    if (!enabled || !fromPanel(ev)) { try { d.bitmap.close(); } catch { /* ignore */ } return; }
    dropFrame();
    frame = d.bitmap;
  });

  function setEnabled(on) {
    on = Boolean(on);
    if (on === enabled) return;
    enabled = on;
    if (on) {
      ensure();
      view = { kind: 'idle', label: '' };
      document.documentElement.dataset.samvaadVcam = '1';
      draw();
      timer = setInterval(draw, 1000 / FPS);
    } else {
      delete document.documentElement.dataset.samvaadVcam;
      clearInterval(timer);
      timer = null;
      dropFrame();
      if (ctx) { view = { kind: 'off', label: '' }; draw(); } // a stream that is still attached shows this instead of freezing mid-sign
    }
  }

  // msg: { label, hasClip }. A clip is shown from the frames the panel streams; otherwise the sign's name as a text card.
  function play({ label, hasClip }) {
    if (!enabled) return;
    dropFrame();
    view = { kind: hasClip ? 'clip' : 'text', label: label || '' };
  }

  function idle() {
    if (!enabled) return;
    dropFrame();
    view = { kind: 'idle', label: '' };
  }

  globalThis.SamvaadVcam = {
    setEnabled,
    play,
    idle,
    isEnabled: () => enabled,
    isHooked: () => document.documentElement.dataset.samvaadVcamHooked === '1',
    hits: () => Number(document.documentElement.dataset.samvaadVcamHits) || 0,
  };
})();
