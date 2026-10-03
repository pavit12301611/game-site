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
let ROOM_TTL_MS;
let EXPIRED_ROOM_MESSAGE;
let roomCreatedAtMs;
let isRoomExpired;
let roomRemainingMs;
let rememberKnownRoom;
let forgetKnownRoom;
let loadKnownRooms;
let partitionKnownRooms;
let deleteExpiredRoom;
let expireActiveRoom;
let sweepExpiredKnownRooms;
let appState;

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

  ({ state: appState } = await import('../src/state.js'));
  ({
    roomUpdateForMove,
    ROOM_TTL_MS,
    EXPIRED_ROOM_MESSAGE,
    roomCreatedAtMs,
    isRoomExpired,
    roomRemainingMs,
    rememberKnownRoom,
    forgetKnownRoom,
    loadKnownRooms,
    partitionKnownRooms,
    deleteExpiredRoom,
    expireActiveRoom,
    sweepExpiredKnownRooms,
  } = await import('../src/online/rooms.js'));
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

test('a room expires exactly 1 hour after createdAt across all Firestore timestamp shapes', () => {
  const now = 1_700_000_000_000;
  assert.equal(ROOM_TTL_MS, 60 * 60 * 1000);

  const oneHourAgo = now - ROOM_TTL_MS;
  const freshMs = now - ROOM_TTL_MS + 1;

  for (const createdAt of [
    { toMillis: () => oneHourAgo },
    { toDate: () => new Date(oneHourAgo) },
    { seconds: Math.floor(oneHourAgo / 1000), nanoseconds: (oneHourAgo % 1000) * 1e6 },
    new Date(oneHourAgo),
    oneHourAgo,
    new Date(oneHourAgo).toISOString(),
  ]) {
    assert.equal(roomCreatedAtMs({ createdAt }), oneHourAgo);
    assert.equal(isRoomExpired({ createdAt }, now), true);
    assert.equal(roomRemainingMs({ createdAt }, now), 0);
  }

  assert.equal(isRoomExpired({ createdAt: freshMs }, now), false);
  assert.equal(roomRemainingMs({ createdAt: freshMs }, now), 1);
  assert.equal(isRoomExpired({ createdAt: null }, now), false, 'a pending serverTimestamp write is not treated as expired');
  assert.equal(roomRemainingMs({ createdAt: null }, now), null);
});

test('known rooms older than 1 hour are partitioned and automatically swept from Firestore and storage', async () => {
  const storeMap = new Map();
  const fakeStorage = {
    getItem: (key) => storeMap.get(key) ?? null,
    setItem: (key, value) => { storeMap.set(key, value); },
  };
  const now = 1_700_000_000_000;
  rememberKnownRoom('room-old-1', now - ROOM_TTL_MS - 5_000, fakeStorage);
  rememberKnownRoom('room-old-2', now - ROOM_TTL_MS, fakeStorage);
  rememberKnownRoom('room-fresh', now - 15 * 60 * 1000, fakeStorage);

  const partitioned = partitionKnownRooms(loadKnownRooms(fakeStorage), now);
  assert.deepEqual(partitioned.expired.map((item) => item.id), ['room-old-2', 'room-old-1']);
  assert.deepEqual(partitioned.active.map((item) => item.id), ['room-fresh']);
  assert.equal(partitioned.nextDelayMs, 45 * 60 * 1000);

  const deletedRooms = [];
  const deletedPresence = [];
  const swept = await sweepExpiredKnownRooms(now, {
    storage: fakeStorage,
    uid: 'uid-alice',
    allowWithoutStore: true,
    deleteRoomDoc: async (id) => { deletedRooms.push(id); },
    deletePresenceDoc: async (id, uid) => { deletedPresence.push(`${id}:${uid}`); },
  });

  assert.deepEqual(swept, ['room-old-2', 'room-old-1']);
  assert.deepEqual(deletedRooms, ['room-old-2', 'room-old-1']);
  assert.deepEqual(deletedPresence, ['room-old-2:uid-alice', 'room-old-1:uid-alice']);
  assert.deepEqual(loadKnownRooms(fakeStorage).map((item) => item.id), ['room-fresh']);

  forgetKnownRoom('room-fresh', fakeStorage);
  assert.deepEqual(loadKnownRooms(fakeStorage), []);
});

test('expiring the active room closes it, shows the 1-hour expiry message, and deletes it', async () => {
  const deleted = [];
  appState.roomId = 'room-live-expired';
  appState.room = { id: 'room-live-expired', gameId: 'pixel-tac-toe', status: 'playing' };
  appState.onlineActionsPending = 2;
  appState.roomError = '';

  await expireActiveRoom('room-live-expired', 'uid-alice', {
    storage: null,
    deleteRoomDoc: async (id) => { deleted.push(`room:${id}`); },
    deletePresenceDoc: async (id, uid) => { deleted.push(`presence:${id}:${uid}`); },
  });

  assert.equal(appState.room, null);
  assert.equal(appState.onlineActionsPending, 0);
  assert.equal(appState.roomError, EXPIRED_ROOM_MESSAGE);
  assert.deepEqual(deleted, ['presence:room-live-expired:uid-alice', 'room:room-live-expired']);

  await deleteExpiredRoom('room-other-expired', 'uid-bob', {
    storage: null,
    deleteRoomDoc: async (id) => { deleted.push(`room:${id}`); },
    deletePresenceDoc: async (id, uid) => { deleted.push(`presence:${id}:${uid}`); },
  });
  assert.deepEqual(deleted.slice(-2), ['presence:room-other-expired:uid-bob', 'room:room-other-expired']);

  appState.roomId = null;
  appState.roomError = '';
});
