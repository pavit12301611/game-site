/**
 * The production bundle, started the way Vercel starts it: with Firebase configured.
 *
 * Every other test runs with `firebaseReady === false`, because Firebase is never configured in
 * Node. That is the blind spot that let the blank page ship: the code that threw sat inside
 * `if (firebaseReady)`. This test closes it by building the real bundle with (fake but well-formed)
 * VITE_FIREBASE_* values - so `import.meta.env` is baked in and `firebaseReady` is true - and
 * loading that bundle in jsdom.
 *
 * No request is ever allowed to complete: Firebase Auth answers `onAuthStateChanged` with "signed
 * out" from local persistence and `getRedirectResult` with "no redirect pending" from
 * sessionStorage, which is exactly the first-visit path on a deployment, and the one watch a first
 * visit opens (maintenance mode's world-readable `site/status` document) is left hanging, as a
 * stalled connection would. Against the pre-fix src/app.js this test reports
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
 * Every URL the bundle tried to fetch while booting. The first paint must wait for none of them, and
 * the only endpoint a signed-out visit is allowed to touch is this project's own Firestore — the
 * world-readable maintenance switch (`site/status`) that can close the arcade for everyone. Any
 * other host (a CDN, a model download, a backend) means boot grew a dependency it must not have.
 */
const networkCalls = [];
/** True for the Firestore WebChannel traffic of the fake project this bundle was built against. */
function isOwnFirestore(url) {
  return url.startsWith('https://firestore.googleapis.com/') && url.includes(encodeURIComponent('psd-gaming-boot-test'));
}
/**
 * Every timer the bundle scheduled while it booted, so `after()` can clear them.
 *
 * Firestore's client is the reason this exists: it treats a connection that never answers as
 * offline and retries on a backoff timer — forever. That client lives inside the built bundle, so
 * there is no `terminate()` handle to call from out here, and an uncleared timer would keep the
 * test process alive long after the results are in (CI then waits out its six-hour job timeout,
 * which is exactly what happened before this test knew about the maintenance watch). Tracking the
 * timers is the smallest honest way to hand the process back to the runner.
 */
const scheduledTimers = [];

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
  console.error = (...args) => { problems.push(`console.error: ${args.map(String).join(' ')}`); };
  // No real network in this test: every fetch is recorded and then left hanging, which is what a
  // captive portal or a stalled connection looks like. A rejected fetch would make Firestore's
  // WebChannel retry harder and faster, but a request that simply never settles is a case the
  // client waits out — and the first paint must not wait with it.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input) => {
    networkCalls.push(String(input instanceof Request ? input.url : input));
    return new Promise(() => {});
  };
  // The bundle's timers are recorded (see scheduledTimers) because Firestore's client is inside it.
  const originalSetTimeout = globalThis.setTimeout;
  const originalSetInterval = globalThis.setInterval;
  globalThis.setTimeout = (callback, delay, ...rest) => {
    const id = originalSetTimeout(callback, delay, ...rest);
    scheduledTimers.push(['timeout', id]);
    return id;
  };
  globalThis.setInterval = (callback, delay, ...rest) => {
    const id = originalSetInterval(callback, delay, ...rest);
    scheduledTimers.push(['interval', id]);
    return id;
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
  await waitFor(() => appRoot.querySelector('.app-shell') || problems.length, 15_000);
  // Let late failures (an async callback that throws after the paint) land before judging.
  await new Promise((resolve) => setTimeout(resolve, 300));

  console.error = originalError;
  globalThis.fetch = originalFetch;
  // Restored before the tests run: only what the bundle scheduled is of interest here, and the
  // runner's own timers must keep working normally.
  globalThis.setTimeout = originalSetTimeout;
  globalThis.setInterval = originalSetInterval;
  process.off('uncaughtException', onUncaught);
  process.off('unhandledRejection', onUnhandled);
});

after(() => {
  // Hand the process back to the runner: without this, Firestore's offline retry loop keeps the
  // event loop alive forever and the suite never finishes (see scheduledTimers).
  for (const [kind, id] of scheduledTimers) {
    if (kind === 'interval') clearInterval(id);
    else clearTimeout(id);
  }
  scheduledTimers.length = 0;
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

test('the deployed bundle boots with Firebase configured and paints the shell', () => {
  // Firestore's own "the network is down" chatter is provoked on purpose here (the stalled
  // connection above); what must not appear is a browser-side error, an uncaught exception or an
  // unhandled rejection raised by the app's own code — the blank-page class of bug.
  const appProblems = problems.filter((line) => !/Could not reach Cloud Firestore backend/.test(line));
  assert.deepEqual(appProblems, [], 'start-up produced errors');
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

test('booting talks to nothing but the maintenance switch, and never waits for it', () => {
  // A player on a slow or captive connection still gets the shell. The one request a signed-out
  // visit makes is the world-readable `site/status` watch that maintenance mode owns — Firestore
  // multiplexes its watches over one WebChannel stream per database, so it is one fetch. A second
  // one, or any other host, means boot grew a dependency it must not have.
  assert.equal(networkCalls.length, 1, `expected exactly the maintenance watch, saw: ${networkCalls.join(', ')}`);
  assert.ok(isOwnFirestore(networkCalls[0]), `only this project's Firestore may be contacted, not ${networkCalls[0]}`);
});
