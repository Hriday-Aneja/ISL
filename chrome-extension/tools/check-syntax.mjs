// Syntax-checks every JS file and validates manifest references. Run: npm run check
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? (n === 'node_modules' ? [] : walk(join(d, n))) : [join(d, n)]));
for (const f of walk(join(root, 'src')).concat(walk(join(root, 'tests')), walk(join(root, 'tools'))).filter((f) => /\.m?js$/.test(f))) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { failed++; console.error(`SYNTAX ERROR ${f}\n${e.stderr}`); }
}
const m = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const refs = [m.background.service_worker, m.options_page, m.action.default_popup, ...Object.values(m.icons), ...m.content_scripts.flatMap((c) => c.js)];
for (const r of refs) if (!existsSync(join(root, r))) { failed++; console.error(`MISSING manifest file: ${r}`); }
for (const f of ['src/panel/panel.html', 'src/popup/popup.html', 'src/options/options.html', 'src/permissions/permissions.html']) {
  for (const [, ref] of readFileSync(join(root, f), 'utf8').matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (!/^https?:/.test(ref) && !existsSync(join(root, dirname(f), ref))) { failed++; console.error(`MISSING ${ref} referenced by ${f}`); }
  }
}
for (const [, spec] of readFileSync(join(root, 'src/panel/panel.js'), 'utf8').matchAll(/from '(\.[^']+)'/g)) if (!existsSync(join(root, 'src/panel', spec))) { failed++; console.error(`MISSING import ${spec}`); }
console.log(failed ? `${failed} problem(s)` : 'syntax + manifest references OK');
process.exit(failed ? 1 : 0);
