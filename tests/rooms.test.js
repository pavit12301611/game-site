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
import { GAMES, applyGameAction, createInitialGameState } from '../src/catalog.js';

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

test('the last empty Tic-Tac-Toe square writes the draw as a finished room update', () => {
  const players = [{ uid: 'uid-alice', name: 'Alice' }, { uid: 'uid-bob', name: 'Bob' }];
  const game = GAMES.find((entry) => entry.id === 'pixel-tac-toe');
  let state = createInitialGameState(game, players, 'last-square-draw');
  for (const index of [0, 2, 1, 3, 5, 4, 6, 7, 8]) {
    state = applyGameAction(game, state, state.turnUid, { index }, players);
  }

  assert.equal(state.phase, 'finished');
  assert.equal(state.result, 'draw');
  const update = roomUpdateForMove(state);
  assert.equal(update.status, 'finished');
  assert.equal(update.state.phase, 'finished');
  assert.equal(update.winnerUid, null);
});

test('all catalog games use the same finished room-update contract', () => {
  const players = [{ uid: 'uid-alice', name: 'Alice' }, { uid: 'uid-bob', name: 'Bob' }];
  for (const game of GAMES) {
    const state = { ...createInitialGameState(game, players, `finished:${game.id}`), phase: 'finished', winnerUid: null };
    const update = roomUpdateForMove(state);
    assert.equal(update.status, 'finished', game.id);
    assert.equal(update.state.phase, 'finished', game.id);
    assert.equal(update.winnerUid, null, game.id);
  }
});

test('it never invents a match it was not told about', () => {
  for (const state of [{ phase: 'playing' }, {}, null, undefined]) {
    assert.equal(roomUpdateForMove(state).status, undefined);
  }
});
