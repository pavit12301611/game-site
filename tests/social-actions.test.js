/**
 * The client-side half of reporting and blocking.
 *
 * Both live on callable Cloud Functions, so what is worth testing here is what the browser refuses
 * *before* it spends a network call and a rate-limit token: an empty report, a report from nobody, a
 * block aimed at yourself. The server-side rules for the same actions are covered by
 * `functions/test/handlers.test.js` and the emulator suite.
 */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

let reportProblem;
let blockPlayer;
let unblockPlayer;
let state;

before(async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'https://psd-gaming.test/', pretendToBeVisual: true });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const define = (name, value) => Object.defineProperty(global, name, { value, configurable: true, writable: true });
  define('window', window);
  define('document', window.document);
  define('navigator', window.navigator);
  define('localStorage', window.localStorage);
  define('location', window.location);
  define('matchMedia', window.matchMedia);
  define('requestAnimationFrame', window.requestAnimationFrame.bind(window));
  ({ reportProblem, blockPlayer, unblockPlayer } = await import('../src/social.js'));
  ({ state } = await import('../src/state.js'));
});

test('a report needs a signed-in (or guest) player and a real message', async () => {
  state.user = null;
  await assert.rejects(() => reportProblem({ message: 'something broke' }), /Sign in or continue as a guest/);
  state.user = { uid: 'me' };
  await assert.rejects(() => reportProblem({ message: 'no' }), /few words/);
  await assert.rejects(() => reportProblem({ message: '    ' }), /few words/);
});

test('you cannot block yourself, and a block needs a target', async () => {
  state.user = { uid: 'me' };
  await assert.rejects(() => blockPlayer('me'), /Choose another player/);
  await assert.rejects(() => unblockPlayer(''), /Choose a player|Sign in/, 'an empty uid never reaches the backend');
  state.user = null;
  await assert.rejects(() => unblockPlayer('someone'), /Sign in/);
});
