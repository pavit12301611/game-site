#!/usr/bin/env node
/**
 * Mirrors the code that both the browser and Cloud Functions need into functions/vendor/.
 *
 * Why a mirror and not an npm workspace: `firebase deploy --only functions` uploads only the
 * directory named in firebase.json, so anything the functions import has to live under
 * functions/. The mirror keeps one source of truth in the repository (shared/** and src/engines/**)
 * and copies it, preserving the relative layout, so the same `../../shared/...` import specifiers
 * resolve on both sides.
 *
 *   shared/**      -> functions/vendor/shared/**
 *   src/engines/** -> functions/vendor/src/engines/**
 *
 * functions/vendor/ is generated and git-ignored. Run this before the Functions emulator, before
 * `firebase deploy`, and after editing anything under shared/ or src/engines/:
 *
 *   node scripts/sync-shared.mjs
 *   node scripts/sync-shared.mjs --check   # fails when the mirror is stale (used by tests)
 *
 * firebase.json runs it automatically as a predeploy hook.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** Every directory that is mirrored, as [source, destination] relative to the repository root. */
export const MIRRORED_DIRECTORIES = [
  ['shared', 'functions/vendor/shared'],
  ['src/engines', 'functions/vendor/src/engines'],
];

/** @returns {Array<{ path: string, bytes: number, sha256: string }>} the file list the mirror must have. */
export function mirrorManifest() {
  /** @type {Array<{ path: string, bytes: number, sha256: string }>} */
  const entries = [];
  for (const [source] of MIRRORED_DIRECTORIES) {
    const absolute = join(ROOT, source);
    if (!existsSync(absolute)) continue;
    for (const file of walk(absolute)) {
      const relative = file.slice(ROOT.length).split('\\').join('/');
      entries.push({ path: relative, bytes: statSync(file).size, sha256: sha256(readFileSync(file)) });
    }
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

/** @param {string} dir @returns {string[]} every file under `dir`, recursively. */
function walk(dir) {
  /** @type {string[]} */
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

/** @param {import('node:buffer').Buffer | string} value */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Copies the shared sources into functions/vendor/, replacing whatever was there.
 * @param {{ root?: string, dryRun?: boolean }} [options]
 * @returns {{ files: number, written: string[] }}
 */
export function syncShared({ root = ROOT, dryRun = false } = {}) {
  const written = [];
  for (const [source, destination] of MIRRORED_DIRECTORIES) {
    const from = join(root, source);
    const to = join(root, destination);
    if (!existsSync(from)) continue;
    if (dryRun) {
      written.push(`${source} -> ${destination} (dry run)`);
      continue;
    }
    rmSync(to, { recursive: true, force: true });
    mkdirSync(to, { recursive: true });
    cpSync(from, to, { recursive: true });
    written.push(`${source} -> ${destination}`);
  }
  return { files: mirrorManifest().length, written };
}

/** Compares the committed sources with what the mirror currently holds. */
export function checkMirror() {
  /** @type {string[]} */
  const stale = [];
  for (const [source, destination] of MIRRORED_DIRECTORIES) {
    const from = join(ROOT, source);
    const to = join(ROOT, destination);
    if (!existsSync(to)) {
      stale.push(`${destination} is missing (run: node scripts/sync-shared.mjs)`);
      continue;
    }
    for (const file of walk(from)) {
      const relative = file.slice(from.length + 1);
      const target = join(to, relative);
      if (!existsSync(target)) stale.push(`${destination}/${relative} is missing`);
      else if (sha256(readFileSync(file)) !== sha256(readFileSync(target))) stale.push(`${destination}/${relative} differs from ${source}/${relative}`);
    }
  }
  return stale;
}

if (process.argv[1]?.endsWith('sync-shared.mjs')) {
  if (process.argv.includes('--check')) {
    const stale = checkMirror();
    if (stale.length) {
      console.error(`functions/vendor is out of date:\n  ${stale.join('\n  ')}\nRun: node scripts/sync-shared.mjs`);
      process.exit(1);
    }
    console.log('functions/vendor matches shared/ and src/engines/.');
  } else {
    const result = syncShared();
    console.log(`Mirrored ${result.files} files:\n  ${result.written.join('\n  ')}`);
  }
}
