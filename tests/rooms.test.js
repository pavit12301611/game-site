/**
 * What a move writes back to a room.
 *
 * `roomUpdateForMove` is the one piece of the online game that can be checked without a network:
 * a move is just the new state, except when it ends the match, and then the room closes too.
 *
 * It lives in `src/online/rooms.js`, which touches the DOM through `src/render.js`, so this file
 * sets up the same minimal jsdom window `tests/app-render.test.js` uses.
 */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

let roomUpdateForMove;

before(async () => {
  const dom = new JSDOM('<!doctype html><html><head><meta id="meta-theme-color" content=""></head><body><div id="app"></div></body></html>', {
    url: 'https://psd-gaming.test/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const define = (name, value) => Object.defineProperty(global, name, { value, configurable: true, writable: true });
  define('window', window);
  define('document', window.document);
  define('navigator', window.navigator);
  define('localStorage', window.localStorage);
  define('location', window.location);

  ({ roomUpdateForMove } = await import('../src/online/rooms.js'));
});

test('a normal move writes the new state and a server clock', () => {
  const update = roomUpdateForMove({ phase: 'playing', moves: 3 });
  assert.deepEqual(Object.keys(update).sort(), ['state', 'updatedAt']);
  assert.equal(update.state.moves, 3);
});

test('the winning move closes the room and names the winner', () => {
  const update = roomUpdateForMove({ phase: 'finished', winnerUid: 'uid-alice', result: 'winner' });
  assert.deepEqual(Object.keys(update).sort(), ['state', 'status', 'updatedAt', 'winnerUid']);
  assert.equal(update.status, 'finished');
  assert.equal(update.winnerUid, 'uid-alice');
});

test('a drawn match closes the room with no winner', () => {
  const update = roomUpdateForMove({ phase: 'finished', winnerUid: null, result: 'draw' });
  assert.equal(update.status, 'finished');
  assert.equal(update.winnerUid, null);
});

test('it never invents a match it was not told about', () => {
  for (const state of [{ phase: 'playing' }, {}, null, undefined]) {
    assert.equal(roomUpdateForMove(state).status, undefined);
  }
});
