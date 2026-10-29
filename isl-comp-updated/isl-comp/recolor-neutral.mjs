#!/usr/bin/env node
/**
 * Samvaad: remove every warm / yellowish / neon colour and switch to a neutral graphite theme.
 *
 * Run from the isl-comp folder (the one that has tailwind.config.js and src/):
 *     node recolor-neutral.mjs
 *
 * It rewrites colours in place, so it works no matter which patches you already applied.
 * Running it twice is safe. At the end it scans the project and prints any warm colour left.
 * Use `git diff` to review the result, or `git checkout .` to undo it.
 */
import fs from 'node:fs';
import path from 'node:path';

if (!fs.existsSync('tailwind.config.js') || !fs.existsSync('src')) {
  console.error('Run this from the isl-comp folder (tailwind.config.js and src/ must be here).');
  process.exit(1);
}

// ---------- 1. hex colours (case-insensitive, also matches three.js 0xRRGGBB) ----------
const HEX = {
  // warm accent (saffron / voice) -> muted steel blue
  c58b4e: '8fa4c4', d49e64: 'a6b8d2',
  // warm text (cream / mist) -> neutral
  e8e2d5: 'ececee', a39f94: '9a9ea5',
  // warm near-black used as text on accent buttons
  '1a1204': '0e1116',
  // mint / signal -> muted sage-teal
  '8ca596': '86a89f', a3b9ab: '9cbab3',
  // dark text on signal-coloured chips
  '06231d': '0c1413', '04201a': '0c1413', '04150e': '0c1413',
  // neon / gold chip text
  '5eead4': 'b3cfc9', f0ce8b: 'bfcce0', '8dd7c4': 'a9c7c0',
  // whatsapp-style greens in chat bubbles
  d9fdd3: 'dde1e6', '17351b': '14181d', '54715a': '5c6672',
  '202c33': '1e2024', '0b141a': '131417',
  // lilac greys + navy / indigo gradients -> neutral graphite
  b6bbce: 'a8abb1', bfc6e0: 'c9ccd2',
  '181e38': '1b1c20', '0d1020': '111215', '12203a': '1c1e22', '080a16': '0e0f11',
  '2a2f63': '2a2c31', '0e1128': '15161a', '2a1f5c': '24262b', '171f48': '1a1c20',
  '0f2f33': '15171a', '070914': '0c0d0f', '0d1220': '101114',
  effffb: 'f2f3f4', e9fffa: 'f2f3f4',
  // light-theme accent for the sign demo
  '0b9c82': '4f6f94',
  // light palette tokens (paper / ink)
  f7f8f5: 'f6f6f7', eef1ed: 'edeef0', '17211f': '16171a',
  '66736f': '6a6d73', dde4e1: 'dee0e3', '5b6a66': '6a6d73',
  // dark surfaces (slightly green-blue -> neutral graphite)
  '121416': '111214', '1a1d20': '18191c', '23272b': '212226', '30353a': '2d2e32',
  // 3D hands: warm key light and beige / greenish skin -> neutral
  fff0dc: 'ffffff', d9d2c4: 'd6d8dc', cfd3c6: 'c8cbd0',
};

// ---------- 2. rgb triplets (inside rgba()/rgb(), and bare CSS-variable triplets) ----------
const RGB = [
  [[197, 139, 78], [143, 164, 196]],
  [[232, 226, 213], [236, 237, 238]],
  [[140, 165, 150], [134, 168, 159]],
  [[23, 33, 31], [22, 23, 26]],
  [[7, 9, 20], [12, 13, 15]],
  [[17, 21, 42], [24, 25, 28]],
  [[190, 196, 214], [190, 193, 200]],
  [[167, 173, 194], [165, 168, 175]],
  [[11, 156, 130], [79, 111, 148]],
  // sign-demo surface -> darker graphite (applied after the lines above)
  [[24, 25, 28], [16, 17, 20]],
];

// ---------- 2b. darker dark-theme surfaces (one pass, so values never chain) ----------
//   page bg #111214 -> #0a0b0d, cards #18191c -> #101114, raised #212226 -> #17181b, border #2d2e32 -> #222428
const DARK = { '111214': '0a0b0d', '18191c': '101114', '212226': '17181b', '2d2e32': '222428' };
const DARK_RE = new RegExp('(#|\\b0x)(' + Object.keys(DARK).join('|') + ')(?![0-9a-f])', 'gi');

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|css)$/.test(e.name)) out.push(p);
  }
  return out;
};
const files = [...walk('src'), 'tailwind.config.js', ...(fs.existsSync('index.html') ? ['index.html'] : [])];

const changed = new Set();
const edit = (file, fn) => {
  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);
  if (after !== before) { fs.writeFileSync(file, after); changed.add(file); }
};

for (const f of files) {
  edit(f, (s) => {
    for (const [o, n] of Object.entries(HEX)) {
      s = s.replace(new RegExp('#' + o + '(?![0-9a-f])', 'gi'), '#' + n);
      s = s.replace(new RegExp('\\b0x' + o + '(?![0-9a-f])', 'gi'), '0x' + n);
    }
    s = s.replace(DARK_RE, (m, pre, hx) => pre + DARK[hx.toLowerCase()]);
    for (const [[r, g, b], [R, G, B]] of RGB) {
      // rgba(197,139,78 ...) / rgb(197, 139, 78)
      s = s.replace(new RegExp('(rgba?\\(\\s*)' + r + '\\s*,\\s*' + g + '\\s*,\\s*' + b + '\\b', 'g'), `$1${R},${G},${B}`);
      // bare triplets such as  --sd-accent-rgb: 140,165,150;
      s = s.replace(new RegExp('(--[\\w-]*rgb\\s*:\\s*)' + r + '\\s*,\\s*' + g + '\\s*,\\s*' + b + '\\b', 'g'), `$1${R}, ${G}, ${B}`);
    }
    return s;
  });
}

// ---------- 3. guarded structural edits (skipped silently if already done / not present) ----------
const sub = (file, from, to) => {
  if (!fs.existsSync(file)) return;
  edit(file, (s) => (s.includes(from) ? s.split(from).join(to) : s));
};

// particle hand: palm teal -> fingertip steel blue
sub('src/components/landing/SilenceHero.tsx',
  '// mint (palm) -> saffron (fingertips)\n      hcol[i * 3] = 0.55 + 0.22 * k;\n      hcol[i * 3 + 1] = 0.65 - 0.1 * k;\n      hcol[i * 3 + 2] = 0.59 - 0.28 * k;',
  '// teal (palm) -> steel blue (fingertips)\n      hcol[i * 3] = 0.525 + 0.036 * k;\n      hcol[i * 3 + 1] = 0.659 - 0.016 * k;\n      hcol[i * 3 + 2] = 0.624 + 0.145 * k;');

// default Tailwind slate -> neutral
sub('src/components/daily/MessageBubble.tsx', 'text-slate-400', 'text-neutral-400');
sub('src/components/daily/MessageBubble.tsx', 'text-slate-300', 'text-neutral-300');

// coloured glow blobs -> faint neutral white
for (const f of ['src/components/communication/RoomGate.tsx', 'src/pages/Home.tsx', 'src/pages/CommunicationRoom.tsx']) {
  if (!fs.existsSync(f)) continue;
  edit(f, (s) => s.split('\n').map((line) => {
    if (/blur-\[(90|100)px\]/.test(line) && /bg-(saffron|voice|mint|signal)\b/.test(line)) {
      line = line.replace(/bg-(saffron|voice|mint|signal)\b/g, 'bg-white');
      line = line.replace(/opacity-\[0\.\d+\]|opacity-25/g, 'opacity-[0.05]');
    }
    return line;
  }).join('\n'));
}
sub('src/components/communication/AvatarPanel.tsx',
  "isActive ? 'bg-voice/[0.12]' : 'bg-signal/[0.07]'", "isActive ? 'bg-white/[0.08]' : 'bg-white/[0.04]'");

// token comments in tailwind.config.js
sub('tailwind.config.js', "// Room accents: mint = the signer's side, saffron = the speaker's side.",
  "// Room accents: signal (sage-teal) = the signer's side, voice (steel blue) = the speaker's side.");
sub('tailwind.config.js', '// Landing page palette (midnight + saffron + mint).',
  '// Landing page palette (neutral graphite + steel blue + sage). The names saffron/mint/cream/mist are\n        // kept so existing classes keep working; the values are no longer warm or yellowish.');

// stale comments
sub('tailwind.config.js', "// Room accents: mint = the signer's side, saffron = the speaker's side.",
  "// Room accents: signal (sage-teal) = the signer's side, voice (steel blue) = the speaker's side.");
sub('tailwind.config.js', '// Landing page palette (midnight + saffron + mint).',
  '// Landing page palette (neutral graphite + steel blue + sage). The names saffron/mint/cream/mist are\n        // kept so existing classes keep working; the values are no longer warm or yellowish.');
sub('src/components/signdemo/signdemo.css', 'electric mint-cyan', 'muted sage-teal');
sub('src/components/signdemo/signdemo.css', 'so the neon skeleton reads well', 'so the skeleton reads well');

// ---------- 4. report ----------
console.log(`\nRewrote ${changed.size} file(s).`);
for (const f of [...changed].sort()) console.log('  ' + f);

// scan: any hex / rgb colour that is still warm (hue 15-95 deg, noticeably saturated)?
const hsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
};
const warm = ([h, s, l]) => h >= 15 && h <= 95 && s > 0.1 && l > 0.08 && l < 0.97;
const left = new Map();
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/#([0-9a-f]{6})(?![0-9a-f])|\b0x([0-9a-f]{6})(?![0-9a-f])/gi)) {
    const hx = m[1] || m[2];
    if (warm(hsl(parseInt(hx.slice(0, 2), 16), parseInt(hx.slice(2, 4), 16), parseInt(hx.slice(4, 6), 16)))) {
      (left.get('#' + hx.toLowerCase()) ?? left.set('#' + hx.toLowerCase(), new Set()).get('#' + hx.toLowerCase())).add(f);
    }
  }
  for (const m of s.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    if (warm(hsl(+m[1], +m[2], +m[3]))) {
      const k = `rgb(${m[1]},${m[2]},${m[3]})`;
      (left.get(k) ?? left.set(k, new Set()).get(k)).add(f);
    }
  }
}
const cfg = fs.readFileSync('tailwind.config.js', 'utf8');
const tokenOk = /saffron:\s*'#8fa4c4'/i.test(cfg);
console.log('\ntailwind.config.js accent token:', tokenOk ? 'OK (#8fa4c4)' : 'NOT UPDATED - something is wrong');
console.log('tailwind.config.js page background:', /night:\s*\{\s*DEFAULT:\s*'#0a0b0d'/i.test(cfg) ? 'OK (#0a0b0d, darker)' : 'not the darker value');
if (!left.size) console.log('Scan: no warm / yellowish colours left in src or tailwind.config.js.');
else { console.log('Scan: warm colours still present:'); for (const [c, fs_] of left) console.log('  ' + c, [...fs_].join(', ')); }
console.log('\nNow restart the dev server with a clean cache:');
console.log('  (stop npm run dev)  ->  rm -rf node_modules/.vite  ->  npm run dev   (Windows: rmdir /s /q node_modules\\.vite)');
console.log('then hard refresh the browser (Ctrl+Shift+R).');
