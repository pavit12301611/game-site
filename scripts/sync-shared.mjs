/**
 * Syncs the shared/ directory into functions/vendor/ for the backend tests.
 */

import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const vendorDir = resolve(root, 'functions', 'vendor');
const srcDirs = ['shared', 'src/engines'];

const check = process.argv.includes('--check');

if (check) {
  for (const dir of srcDirs) {
    if (!existsSync(resolve(vendorDir, dir.split('/').pop()))) {
      console.error(`[sync-shared] ✘ ${dir} is not mirrored in functions/vendor/. Run: node scripts/sync-shared.mjs`);
      process.exit(1);
    }
  }
  console.log('[sync-shared] ✔ Shared mirror is up to date.');
  process.exit(0);
}

rmSync(vendorDir, { recursive: true, force: true });
mkdirSync(vendorDir, { recursive: true });

for (const dir of srcDirs) {
  const src = resolve(root, dir);
  const dest = resolve(vendorDir, dir.split('/').pop());
  if (existsSync(src)) cpSync(src, dest, { recursive: true });
}

console.log('[sync-shared] ✔ Shared files synced to functions/vendor/.');