import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Guards the security headers in vercel.json.
 *
 * A Content-Security-Policy typo does not fail the build, it breaks the deployed site: Google
 * sign-in stops opening, or Firestore goes silent. These checks keep the origins the Firebase SDK
 * needs in place and allow inline styles only where the runtime style attributes need them.
 */
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

function headerFor(key, source = '/(.*)') {
  const block = config.headers.find((entry) => entry.source === source);
  assert.ok(block, `vercel.json has no header block for ${source}`);
  const header = block.headers.find((entry) => entry.key.toLowerCase() === key.toLowerCase());
  assert.ok(header, `${key} is missing from vercel.json`);
  return header.value;
}

const CSP = headerFor('Content-Security-Policy');

function directive(name) {
  const match = CSP.match(new RegExp(`(?:^|;)\\s*${name}\\s+([^;]*)`));
  assert.ok(match, `the CSP has no ${name} directive`);
  return match[1].trim();
}

const CONNECT = directive('connect-src');

test('the deployment config installs browser-only dependencies and builds a Vite app from dist', () => {
  assert.equal(config.outputDirectory, 'dist');
  assert.equal(config.installCommand, 'npm ci --ignore-scripts');
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.framework, 'vite');
});

test('every response carries the baseline security headers', () => {
  assert.equal(headerFor('X-Content-Type-Options'), 'nosniff');
  assert.equal(headerFor('Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.equal(headerFor('X-Frame-Options'), 'SAMEORIGIN');
  assert.match(headerFor('Strict-Transport-Security'), /max-age=31536000/, 'HSTS lasts at least a year');
  assert.match(headerFor('Strict-Transport-Security'), /includeSubDomains/);
  assert.match(headerFor('Permissions-Policy'), /camera=\(\)/, 'no camera, because nothing needs one');
});

test('popups keep working: Google sign-in needs same-origin-allow-popups', () => {
  assert.equal(
    headerFor('Cross-Origin-Opener-Policy'),
    'same-origin-allow-popups',
    'plain same-origin would break the Google sign-in popup',
  );
});

test('the CSP allows Firebase and static model-weight endpoints without opening arbitrary connections', () => {
  for (const origin of [
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://firestore.googleapis.com',
  ]) {
    assert.ok(
      CONNECT.includes(origin) || CONNECT.includes('https://*.googleapis.com'),
      `connect-src must reach ${origin}`,
    );
  }
  assert.match(CONNECT, /wss:\/\/\*\.firebaseio\.com/, 'Firestore also streams over a websocket');
  assert.match(
    CONNECT,
    /https:\/\/\*\.cloudfunctions\.net/,
    'every online mutation is a callable, which the SDK reaches at https://<region>-<project>.cloudfunctions.net',
  );
  assert.match(CONNECT, /https:\/\/\*\.firebaseapp\.com/, 'the auth domain is used by redirect sign-in');
  for (const origin of [
    'https://huggingface.co',
    'https://cdn-lfs.huggingface.co',
    'https://cas-bridge.xethub.hf.co',
    'https://cdn-lfs-us-1.hf.co',
  ]) {
    assert.ok(CONNECT.includes(origin), `connect-src must allow the static model-weight host ${origin}`);
  }
  assert.ok(!CONNECT.includes('http://'), 'connect-src must stay on https');
});

test('the CSP allows the frames and scripts Google sign-in loads', () => {
  assert.match(directive('frame-src'), /accounts\.google\.com/);
  assert.match(directive('script-src'), /apis\.google\.com/);
  assert.match(directive('img-src'), /googleusercontent\.com/, 'Google profile photos');
});

test('the script-src rejects inline scripts while runtime style attributes stay allowed', () => {
  assert.equal(directive('script-src'), "'self' https://apis.google.com https://www.gstatic.com 'wasm-unsafe-eval'");
  assert.doesNotMatch(directive('script-src'), /'unsafe-inline'/);
  assert.equal(directive('worker-src'), "'self' blob:", 'the module worker stays same-origin or an app-created blob');
  assert.match(directive('style-src'), /'unsafe-inline'/, 'cards set custom properties with style attributes');
});

test('the CSP closes the doors it does not need', () => {
  assert.equal(directive('object-src'), "'none'");
  assert.equal(directive('base-uri'), "'self'");
  assert.equal(directive('form-action'), "'self'");
  assert.equal(directive('frame-ancestors'), "'self'");
  assert.ok(directive('default-src').includes("'self'"));
});

test('hashed asset filenames are cached immutably', () => {
  assert.match(headerFor('Cache-Control', '/assets/(.*)'), /max-age=31536000/);
});
