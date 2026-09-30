import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'images']);
const TEXT_EXTENSIONS = new Set(['.js', '.json', '.html', '.css', '.md', '.rules', '.example', '.yml', '.yaml', '']);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* walk(path);
    } else if (TEXT_EXTENSIONS.has(extname(name)) && name !== 'package-lock.json') {
      yield path;
    }
  }
}

const files = [...walk(root)].map((path) => ({ path: relative(root, path), text: readFileSync(path, 'utf8') }));

// Shapes of real credentials. None of these may appear anywhere in the repository.
const SECRET_SHAPES = {
  'Google API key (AIza...)': /AIza[0-9A-Za-z_-]{35}/,
  'PEM private key': /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  'service-account key file': /"type"\s*:\s*"service_account"/,
  'Google OAuth client secret': /GOCSPX-[A-Za-z0-9_-]{8,}/,
};

test('the repository contains no Firebase API key, private key, service-account file or OAuth secret', () => {
  assert.ok(files.length > 10, 'the scan must actually look at the project files');
  const offenders = [];
  for (const { path, text } of files) {
    for (const [label, pattern] of Object.entries(SECRET_SHAPES)) {
      if (pattern.test(text)) offenders.push(`${path}: ${label}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('the Firebase web config is never hard-coded in application code', () => {
  const appFiles = files.filter(({ path }) => /^(src|scripts)\//.test(path) || ['index.html', 'vite.config.js'].includes(path));
  assert.ok(appFiles.some(({ path }) => path === 'src/firebase.js'));
  const offenders = [];
  for (const { path, text } of appFiles) {
    if (/(?:const|let|var)\s+firebaseConfig\s*=\s*\{/.test(text)) offenders.push(`${path}: firebaseConfig object literal`);
    if (/["']?apiKey["']?\s*:\s*["'](?!VITE_)[^"'\s]{12,}["']/.test(text)) offenders.push(`${path}: literal apiKey value`);
  }
  assert.deepEqual(offenders, []);
});

test('env files that could hold a real config are ignored by git; only .env.example is tracked', () => {
  const gitignore = readFileSync(join(root, '.gitignore'), 'utf8').split('\n').map((line) => line.trim());
  assert.ok(gitignore.includes('.env'));
  assert.ok(gitignore.includes('.env.*'));
  assert.ok(gitignore.includes('!.env.example'));
});

test('the config is only read from the VITE_FIREBASE_* environment variables', () => {
  const firebase = files.find(({ path }) => path === 'src/firebase.js').text;
  assert.match(firebase, /VITE_FIREBASE_CONFIG/);
  assert.match(firebase, /import\.meta\.env/);
  const config = files.find(({ path }) => path === 'src/firebase-config.js').text;
  for (const name of ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID']) {
    assert.match(config, new RegExp(`VITE_FIREBASE_${name}`));
  }
});
