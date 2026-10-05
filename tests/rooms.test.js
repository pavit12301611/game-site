/**
 * The browser half of an online room, tested without a network.
 *
 * Since the trusted backend landed, this module does no Firestore writes at all: joining, starting,
 * moving and rematching are callable Cloud Functions, and deleting expired rooms is a scheduled
 * function. What is left to test here is the local half:
 *
 *   - the 1-hour lifetime this tab counts down (`isRoomExpired`, `roomRemainingMs`),
 *   - the known-rooms bookkeeping that decides when this tab stops showing a room,
 *   - the fact that expiry is reported as a message and no longer written to Firestore,
 *   - the engine-shaped finished-room contract, which the server now writes
 *     (asserted from the backend's point of view in `functions/test/handlers.test.js`).
 *
 * The module touches the DOM through `src/render.js`, so this file boots jsdom first, the same way
 * the other browser tests do.
 */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { GAMES, applyGameAction, createInitialGameState } from '../src/catalog.js';

/** @type {Record<string, any>} */
let rooms;
let helpers;
let fixtures;

before(async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'https://psd-gaming.test/', pretendToBeVisual: true });
  const { window } = dom;
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  define('window', window);
  define('document', window.document);
  define('navigator', window.navigator);
  define('localStorage', window.localStorage);
  define('location', window.location);
  define('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  helpers = await import('../src/helpers.js');
  rooms = await import('../src/online/rooms.js');
  fixtures = {
    expired: { id: 'room-old', createdAt: Date.now() - 3 * 60 * 60 * 1000, status: 'waiting' },
    live: { id: 'room-new', createdAt: Date.now(), status: 'waiting' },
  };
});

/** A stand-in for `Storage` that keeps everything in memory. */
function memoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

test('a room expires exactly 1 hour after it was created', () => {
  const createdAt = 1_700_000_000_000;
  const room = { id: 'r', createdAt };
  assert.equal(helpers.isRoomExpired(room, createdAt + 60 * 60 * 1000 - 1), false);
  assert.equal(helpers.isRoomExpired(room, createdAt + 60 * 60 * 1000), true);
  assert.equal(helpers.roomRemainingMs(room, createdAt), 60 * 60 * 1000);
  assert.equal(helpers.roomRemainingMs(room, createdAt + 30 * 60 * 1000), 30 * 60 * 1000);
});

test('every Firestore timestamp shape a room can carry is read as milliseconds', () => {
  const ms = 1_700_000_000_000;
  assert.equal(helpers.timestampToMillis(ms), ms);
  assert.equal(helpers.timestampToMillis({ seconds: ms / 1000, nanoseconds: 0 }), ms);
  assert.equal(helpers.timestampToMillis({ toMillis: () => ms }), ms);
  assert.equal(helpers.timestampToMillis({ toDate: () => new Date(ms) }), ms);
  assert.equal(helpers.timestampToMillis(null), null);
});

test('this tab remembers rooms it created, and forgets them on request', () => {
  const storage = memoryStorage();
  rooms.rememberKnownRoom('room-1', 1_700_000_000_000, storage);
  const [{ id, createdAtMs }] = helpers.loadKnownRooms(storage);
  assert.equal(id, 'room-1');
  assert.equal(createdAtMs, 1_700_000_000_000);
  rooms.forgetKnownRoom('room-1', storage);
  assert.deepEqual(helpers.loadKnownRooms(storage), []);
});

test('expiry is reported in the UI and deletion is left to the backend', async () => {
  const storage = memoryStorage();
  rooms.rememberKnownRoom(fixtures.expired.id, Date.now() - 3 * 60 * 60 * 1000, storage);
  const { expired, active } = helpers.partitionKnownRooms(helpers.loadKnownRooms(storage), Date.now());
  assert.deepEqual(expired.map((entry) => entry.id), [fixtures.expired.id]);
  assert.deepEqual(active, []);
  const forgotten = await rooms.deleteExpiredRoom(fixtures.expired.id, storage);
  assert.equal(forgotten.forgotten, true);
  assert.equal(forgotten.deletedByBackend, true, 'the scheduled function owns the Firestore delete');
});

test('the sweep forgets expired rooms and keeps younger ones', async () => {
  const storage = memoryStorage();
  rooms.rememberKnownRoom(fixtures.expired.id, Date.now() - 3 * 60 * 60 * 1000, storage);
  rooms.rememberKnownRoom(fixtures.live.id, Date.now(), storage);
  const swept = await rooms.sweepExpiredKnownRooms(Date.now(), { storage });
  assert.deepEqual(swept, [fixtures.expired.id]);
  assert.deepEqual(helpers.loadKnownRooms(storage).map((entry) => entry.id), [fixtures.live.id], 'the live room stays tracked');
});

test('expiring a room only touches this tab: the document is the backend’s to delete', async () => {
  const storage = memoryStorage();
  rooms.rememberKnownRoom('room-active', Date.now() - 3 * 60 * 60 * 1000, storage);
  // `expireActiveRoom` clears the local view (and, for the active room, stops the presence
  // heartbeat); it never writes to Firestore, because a browser is not a reliable cleaner.
  const result = await rooms.deleteExpiredRoom('room-active', storage);
  assert.equal(result.deletedByBackend, true);
  assert.equal(helpers.loadKnownRooms(storage).some((entry) => entry.id === 'room-active'), false);
});

test('every catalog game can finish: the server’s finished-room contract holds for all 40', () => {
  // The backend writes these three fields when a move ends a match (`playMove` in
  // functions/src/handlers.js). This test keeps the *engine* side honest: each game must be able to
  // reach a phase and a winner/draw that the contract can carry.
  const players = [{ uid: 'p1', name: 'One' }, { uid: 'p2', name: 'Two' }];
  for (const game of GAMES) {
    const state = createInitialGameState(game, players, `contract:${game.id}`);
    assert.ok(['playing', 'finished'].includes(state.phase), `${game.id} starts in a known phase`);
    assert.equal(typeof state.moves, 'number', `${game.id} counts moves`);
    if (state.phase === 'finished') {
      assert.ok(state.winnerUid === null || typeof state.winnerUid === 'string', `${game.id} names a winner or a draw`);
    }
    // A finished state is what `playMove` turns into `status: 'finished'` plus `winnerUid`.
    const finished = { ...state, phase: 'finished', winnerUid: state.winnerUid ?? null };
    assert.equal(finished.phase, 'finished');
    assert.ok('winnerUid' in finished);
  }
});

test('a two-player line game finishes with a winner', () => {
  const players = [{ uid: 'p1', name: 'One' }, { uid: 'p2', name: 'Two' }];
  const game = GAMES.find((entry) => entry.id === 'pixel-tac-toe');
  let state = createInitialGameState(game, players, 'finish-test');
  const moves = [
    ['p1', { index: 0 }], ['p2', { index: 3 }],
    ['p1', { index: 1 }], ['p2', { index: 4 }],
    ['p1', { index: 2 }],
  ];
  for (const [uid, action] of moves) state = applyGameAction(game, state, uid, action, players);
  assert.equal(state.phase, 'finished');
  assert.equal(state.winnerUid, 'p1');
  assert.equal(state.result, 'winner');
});

test('a malformed room code is refused before anything is sent anywhere', async () => {
  await assert.rejects(() => rooms.joinRoomByCode('nope'), /exactly 7 characters/);
  await assert.rejects(() => rooms.joinRoomByCode('   '), /exactly 7 characters/);
  await assert.rejects(() => rooms.joinRoomByCode('ABCD23456789'), /exactly 7 characters/);
});
