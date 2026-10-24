// Bundles tests/*.test.ts with esbuild (already a dependency of Vite) and runs
// them with the Node test runner, so no extra test framework is needed.
import { build } from 'esbuild';
import { readdirSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'node_modules/.cache/daily-tests');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const entries = readdirSync(resolve(root, 'tests'))
  .filter((f) => f.endsWith('.test.ts'))
  .map((f) => resolve(root, 'tests', f));

await build({
  entryPoints: entries,
  outdir: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  outExtension: { '.js': '.mjs' },
  logLevel: 'error',
  define: { 'import.meta.env': '{}' },
});

const files = readdirSync(out).filter((f) => f.endsWith('.mjs')).map((f) => resolve(out, f));
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
