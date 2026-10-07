/**
 * The production bundle, started the way Vercel starts it: with Firebase configured.
 *
 * Every other test runs with `firebaseReady === false`, because Firebase is never configured in
 * Node. That is the blind spot that let the blank page ship: the code that threw sat inside
 * `if (firebaseReady)`. This test closes it by building the real bundle with (fake but well-formed)
 * VITE_FIREBASE_* values - so `import.meta.env` is baked in and `firebaseReady` is true - and
 * loading that bundle in jsdom.
 *
 * Nothing touches the network: Firebase Auth answers `onAuthStateChanged` with "signed out" from
 * local persistence and `getRedirectResult` with "no redirect pending" from sessionStorage, which is
 * exactly the first-visit path on a deployment. Against the pre-fix src/app.js this test reports
 * the two errors the Vercel console showed, word for word:
 *
 *   ReferenceError: processGoogleRedirect is not defined
 *   ReferenceError: refreshAccount is not defined
 *
 * The build goes to a temporary directory and takes a couple of seconds; it is the price of
 * testing what actually ships.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import { CONNECTION_LABELS } from '../src/connection-status.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Well-formed, obviously fake: passes the config validation, belongs to no project, and does not look like a real key (tests/no-secrets-in-repo.test.js scans this file too). */
const FAKE_FIREBASE_ENV = {
  VITE_FIREBASE_API_KEY: 'fake-api-key-for-the-production-boot-test',
  VITE_FIREBASE_AUTH_DOMAIN: 'psd-gaming-boot-test.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'psd-gaming-boot-test',
  VITE_FIREBASE_APP_ID: '1:123456789012:web:0123456789abcdef012345',
};

let outDir;
let dom;
let appRoot;
/** console.error output, uncaught exceptions and unhandled rejections seen while the bundle booted. */
const problems = [];
/**
 * Firestore's own "I cannot reach the backend, going offline" notice, kept apart from `problems`.
 * It is the one expected consequence of reading the maintenance status document (the only network
 * call a first visit makes, and it happens after the paint) in a sandbox that refuses every fetch.
 * Matching it narrowly is the point: a real start-up error must still land in `problems`.
 */
const connectivityNotices = [];
/** Every URL the bundle tried to fetch while booting. The first paint must need none. */
const networkCalls = [];
/** How many of those had happened by the time the shell was in the DOM. Filled in by the wait below. */
let callsBeforeFirstPaint = null;

/** @param {() => unknown} condition @param {number} timeoutMs */
async function waitFor(condition, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return Boolean(condition());
}

before(async () => {
  outDir = mkdtempSync(path.join(os.tmpdir(), 'psd-gaming-dist-'));
  // process.env wins over .env files in Vite's loadEnv, so a developer's .env.local cannot leak in.
  Object.assign(process.env, FAKE_FIREBASE_ENV);
  delete process.env.REQUIRE_FIREBASE_CONFIG;
  await build({
    root,
    configFile: path.join(root, 'vite.config.js'),
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true },
  });

  const html = readFileSync(path.join(outDir, 'index.html'), 'utf8');
  const entry = /<script type="module"[^>]*src="\/(assets\/index-[^"]+\.js)"/.exec(html)?.[1];
  assert.ok(entry, 'index.html references the entry chunk');

  dom = new JSDOM(html, { url: 'https://psd-gaming.test/', pretendToBeVisual: true });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  // Every current browser supports <link rel="modulepreload">, so Vite's polyfill for it is a no-op
  // there. jsdom does not, and the polyfill would fetch every preloaded chunk over the network.
  const { supports } = window.DOMTokenList.prototype;
  window.DOMTokenList.prototype.supports = function (token) {
    return token === 'modulepreload' || supports.call(this, token);
  };
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  for (const name of ['document', 'navigator', 'localStorage', 'sessionStorage', 'location', 'HTMLElement', 'HTMLInputElement', 'Node', 'FormData', 'MutationObserver', 'Event', 'CustomEvent']) {
    define(name, window[name]);
  }
  define('window', window);
  define('self', window);
  define('requestAnimationFrame', window.requestAnimationFrame.bind(window));
  define('getComputedStyle', window.getComputedStyle.bind(window));
  appRoot = window.document.querySelector('#app');

  const originalError = console.error;
  console.error = (...args) => {
    const line = args.map(String).join(' ');
    if (/Could not reach Cloud Firestore backend|operate in offline mode/.test(line)) connectivityNotices.push(line);
    else problems.push(`console.error: ${line}`);
  };
  // No network in this test: anything the bundle fetches is recorded and refused, like a captive
  // portal would. Firebase must cope with that, and the first paint must not depend on it.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input) => {
    networkCalls.push(String(input instanceof Request ? input.url : input));
    return Promise.reject(new TypeError('fetch failed (network disabled in production-boot.test.js)'));
  };
  const onUncaught = (error) => { problems.push(`uncaught: ${error?.stack || error}`); };
  const onUnhandled = (reason) => { problems.push(`unhandled rejection: ${reason?.stack || reason}`); };
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onUnhandled);

  // Not awaited directly: a throw during module evaluation surfaces as an uncaught exception here
  // and would leave this promise unsettled, which must become a failing test, not a hung one.
  import(pathToFileURL(path.join(outDir, entry)).href).catch((error) => {
    problems.push(`import failed: ${error?.stack || error}`);
  });
  await waitFor(() => {
    const painted = Boolean(appRoot.querySelector('.app-shell'));
    if (painted && callsBeforeFirstPaint === null) callsBeforeFirstPaint = networkCalls.length;
    return painted || problems.length;
  }, 15_000);
  // Let late failures (an async callback that throws after the paint) land before judging.
  await new Promise((resolve) => setTimeout(resolve, 300));

  console.error = originalError;
  globalThis.fetch = originalFetch;
  process.off('uncaughtException', onUncaught);
  process.off('unhandledRejection', onUnhandled);
});

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

test('the deployed bundle boots with Firebase configured and paints the shell', () => {
  assert.deepEqual(problems, [], 'start-up produced errors');
  assert.ok(appRoot.querySelector('.app-shell'), '#app contains the shell (the blank page is #app staying empty)');
  assert.ok(appRoot.querySelector('.sidebar .brand-lockup'), 'the sidebar brand is there');
  assert.ok(appRoot.querySelector('.hero-panel h1'), 'the landing page hero is there');
  assert.equal(appRoot.querySelector('.fatal-error'), null, 'and it is the real page, not the recovery screen');
});

test('it really ran the Firebase branch: the bundle reports online rooms, not local practice', () => {
  // Proof that this test does not share the blind spot of the others: firebaseReady is true here.
  const status = appRoot.querySelector('.sidebar-bottom');
  assert.ok(status.querySelector('.connection-dot.is-online'), 'the connection dot is the online one');
  assert.equal(status.textContent.trim(), CONNECTION_LABELS.online);
  assert.ok(appRoot.querySelector('[data-action="open-auth"]'), 'a first visit is signed out, so Sign in is offered');
});

test('the first paint needs no network: nothing was fetched while booting', () => {
  // A player on a slow or captive connection still gets the shell; Firebase talks to its backend
  // only once someone signs in or opens a room.
  assert.notEqual(callsBeforeFirstPaint, null, 'the wait loop recorded the paint');
  assert.deepEqual(networkCalls.slice(0, callsBeforeFirstPaint), []);
});

test('the only thing the SDK complained about is the refused fetch, not about the app', () => {
  assert.ok(connectivityNotices.length <= 2, 'the offline notice is bounded, not a retry storm');
  for (const notice of connectivityNotices) {
    assert.match(notice, /Could not reach Cloud Firestore backend|operate in offline mode/, notice.slice(0, 120));
  }
});

test('the one read the app does make - the maintenance status - happens after the paint', async () => {
  // The site-wide maintenance switch has to be checked on every load (docs/maintenance-mode.md), and
  // it has to be checked *after* the page is already drawn: a locked-out visitor paints the notice
  // from the cache and this read confirms it. A refused fetch must be survivable, which is what the
  // assertions above (no startup errors) prove while the read fails.
  const fetched = await waitFor(() => networkCalls.some((url) => /firestore\.googleapis\.com/.test(url)), 4_000);
  assert.ok(fetched, `the status document was read after the paint (saw: ${networkCalls.join(', ') || 'nothing'})`);
  assert.ok(callsBeforeFirstPaint === 0, 'and not before it');
});
