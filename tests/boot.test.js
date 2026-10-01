/**
 * Start-up must always end in a first paint.
 *
 * `boot()` receives its collaborators, so the Firebase branch - which no local run ever executes,
 * because Firebase is not configured in Node - is exercised here with stand-ins. Every test ends
 * with the same question: was `routeFromHash` called exactly once?
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from '../src/boot.js';

const silent = { error() {} };

/** Collaborators that behave: a signed-out user, no pending redirect. */
function happyDeps(overrides = {}) {
  const calls = { route: 0, refresh: [], reported: [], logged: [] };
  const deps = {
    firebaseReady: true,
    routeFromHash: () => { calls.route += 1; },
    watchAuth: (onUser) => { onUser(null); return () => {}; },
    refreshAccount: async (user) => { calls.refresh.push(user); },
    processGoogleRedirect: async () => {},
    reportAuthError: (error, context) => { calls.reported.push({ error, context }); },
    logger: { error: (...args) => { calls.logged.push(args); } },
    ...overrides,
  };
  return { deps, calls };
}

test('local practice mode draws the page immediately and touches nothing else', async () => {
  const { deps, calls } = happyDeps({
    firebaseReady: false,
    watchAuth: () => { throw new Error('must not be called without Firebase'); },
    processGoogleRedirect: () => { throw new Error('must not be called without Firebase'); },
  });
  const done = boot(deps);
  assert.equal(calls.route, 1, 'the first paint is synchronous');
  await done;
  assert.equal(calls.route, 1);
  assert.deepEqual(calls.refresh, []);
});

test('with Firebase, the page is drawn once the redirect check has finished', async () => {
  let finishRedirect;
  const { deps, calls } = happyDeps({
    processGoogleRedirect: () => new Promise((resolve) => { finishRedirect = resolve; }),
  });
  const done = boot(deps);
  assert.equal(calls.route, 0, 'the paint waits for the redirect result');
  finishRedirect();
  await done;
  assert.equal(calls.route, 1);
  assert.deepEqual(calls.refresh, [null], 'the auth watcher refreshed the (signed-out) account');
  assert.deepEqual(calls.reported, []);
});

test('a rejected redirect check is reported to the player and the page still draws', async () => {
  const failure = new Error('auth/network-request-failed');
  const { deps, calls } = happyDeps({ processGoogleRedirect: () => Promise.reject(failure) });
  await boot(deps);
  assert.equal(calls.route, 1);
  assert.equal(calls.reported.length, 1);
  assert.equal(calls.reported[0].error, failure);
  assert.deepEqual(calls.reported[0].context, { method: 'google-redirect' });
});

test('a redirect check that throws synchronously (the production bug) still draws the page', async () => {
  const { deps, calls } = happyDeps({
    processGoogleRedirect: () => { throw new ReferenceError('processGoogleRedirect is not defined'); },
  });
  await boot(deps);
  assert.equal(calls.route, 1, 'the shell is painted');
  assert.equal(calls.reported.length, 1, 'and the error is not swallowed');
  assert.ok(calls.reported[0].error instanceof ReferenceError);
});

test('an auth watcher that throws is logged and does not stop the paint', async () => {
  const { deps, calls } = happyDeps({
    watchAuth: () => { throw new TypeError('onAuthStateChanged is not a function'); },
  });
  await boot(deps);
  assert.equal(calls.route, 1);
  assert.equal(calls.logged.length, 1);
  assert.match(String(calls.logged[0][0]), /sign-in state/);
});

test('a failing account refresh is logged, not left as an unhandled rejection', async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const { deps, calls } = happyDeps({
      refreshAccount: () => Promise.reject(new Error('permission-denied')),
    });
    await boot(deps);
    // Give the rejection a turn of the microtask queue to be handled.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.route, 1);
    assert.equal(calls.logged.length, 1);
    assert.match(String(calls.logged[0][0]), /account could not be refreshed/);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

test('a refresh that throws synchronously inside the watcher is logged too', async () => {
  const { deps, calls } = happyDeps({
    refreshAccount: () => { throw new ReferenceError('refreshAccount is not defined'); },
  });
  await boot(deps);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.route, 1);
  assert.equal(calls.logged.length, 1);
});

test('every sign-in state change refreshes the account, long after start-up', async () => {
  /** @type {(user: unknown) => void} */
  let emit = () => {};
  const { deps, calls } = happyDeps({ watchAuth: (onUser) => { emit = onUser; } });
  await boot(deps);
  emit({ uid: 'guest-1', isAnonymous: true });
  emit(null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.refresh.map((user) => user?.uid ?? null), ['guest-1', null]);
  assert.equal(calls.route, 1, 'auth changes re-render through refreshAccount, never a second boot paint');
});

test('the page is never drawn twice by boot itself', async () => {
  const { deps, calls } = happyDeps({
    processGoogleRedirect: () => Promise.reject(new Error('x')),
    reportAuthError: () => { throw new Error('reporting failed as well'); },
  });
  await assert.rejects(boot(deps), /reporting failed/, 'a broken reporter is not hidden');
  assert.equal(calls.route, 1, 'but the page was still drawn before that surfaced');
});

test('boot never logs through the real console in these tests (logger is injectable)', async () => {
  const { deps } = happyDeps({ logger: silent, watchAuth: () => { throw new Error('boom'); } });
  await boot(deps);
});
