/**
 * The bridge to the trusted backend, tested without a network.
 *
 * `toBackendError` decides what a player reads when a callable fails, and two of those failures
 * look nothing like each other in the SDK yet must not be confused:
 *
 *   - an **undeployed** function answers 404, that response has no `Access-Control-Allow-Origin`
 *     header, so the browser's preflight fails and the SDK surfaces the opaque "internal" — the
 *     console meanwhile shows a CORS error that masks the missing deployment;
 *   - a **deployed** backend's own internal error arrives as a proper `HttpsError` with our policy
 *     code in `details` and a sentence written for the player.
 *
 * The module imports `src/state.js` (through `src/connection.js`), which reads `localStorage` while
 * loading, so this file boots jsdom first the same way the other browser tests do.
 */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/** @type {typeof import('../src/online/callables.js')} */
let callables;

before(async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://psd-gaming.test/', pretendToBeVisual: true });
  const { window } = dom;
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  define('window', window);
  define('document', window.document);
  define('navigator', window.navigator);
  define('localStorage', window.localStorage);
  define('location', window.location);
  callables = await import('../src/online/callables.js');
});

test('a request that never got through (CORS-masked 404, dropped connection) reads as backend-unreachable', () => {
  // The callable SDK maps a rejected fetch to code "internal" with the bare word "internal" as the
  // message and no details — exactly what an undeployed function produces, because its 404 carries
  // no Access-Control-Allow-Origin header and the preflight fails before the SDK sees a status.
  const error = callables.toBackendError({ code: 'functions/internal', message: 'internal' }, 'createRoom');
  assert.ok(error instanceof callables.BackendError);
  assert.equal(error.code, 'backend-unreachable');
  assert.match(error.message, /not answering/);
  assert.match(error.message, /not deployed/);
  assert.match(error.hint, /firebase deploy --only functions/);
});

test('a genuine internal failure from the deployed backend keeps its own message and code', () => {
  // Our backend wraps unexpected failures in HttpsError('internal', …, { code: 'internal' }), so
  // the details carry a policy code and the server's sentence must win over the generic mapping.
  const error = callables.toBackendError({
    code: 'functions/internal',
    message: 'The online service hit an unexpected problem. Please try again.',
    details: { code: 'internal' },
  }, 'playMove');
  assert.equal(error.code, 'internal');
  assert.equal(error.message, 'The online service hit an unexpected problem. Please try again.');
});

test('an explicit 404 from the SDK still reads as backend-missing with the deploy hint', () => {
  const error = callables.toBackendError({ code: 'functions/not-found', message: 'not-found' }, 'createRoom');
  assert.equal(error.code, 'backend-missing');
  assert.match(error.message, /not responding \(createRoom\)/);
  assert.match(error.hint, /Blaze plan/);
});

test('policy codes and retry hints survive the mapping untouched', () => {
  const error = callables.toBackendError({
    code: 'functions/resource-exhausted',
    message: 'Too many rooms. Try again in 1 minute.',
    details: { code: 'rate-limited', retryAfterMs: 60000 },
  }, 'createRoom');
  assert.equal(error.code, 'rate-limited');
  assert.equal(error.message, 'Too many rooms. Try again in 1 minute.');
  assert.equal(error.retryAfterMs, 60000);
});
