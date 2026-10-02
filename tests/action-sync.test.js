import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGameState } from '../src/catalog.js';
import {
  ONLINE_ACTION_HISTORY_LIMIT,
  hasOnlineAction,
  markOnlineAction,
  markOnlineReset,
  onlineRevision,
  roomAfterOnlineAction,
  roomAfterOnlineActions,
} from '../src/online/action-sync.js';

const players = [
  { uid: 'alice', name: 'Alice' },
  { uid: 'bob', name: 'Bob' },
];

function room(gameId) {
  return {
    id: 'fast-room',
    gameId,
    playerUids: players.map((player) => player.uid),
    playerNames: Object.fromEntries(players.map((player) => [player.uid, player.name])),
    status: 'playing',
    state: createInitialGameState(gameId, players, 'fast-room'),
  };
}

test('an online action produces an immediate engine-valid room frame', () => {
  const next = roomAfterOnlineAction(room('pixel-tac-toe'), 'alice', { index: 4 }, 'move-a');
  assert.equal(next.state.board[4], 'alice');
  assert.equal(next.state.turnUid, 'bob');
  assert.equal(next.state.moves, 1);
  assert.equal(onlineRevision(next.state), 1);
  assert.equal(hasOnlineAction(next.state, 'move-a'), true);
});

test('replaying an acknowledged action id never applies the move twice', () => {
  const once = roomAfterOnlineAction(room('pixel-tap'), 'alice', { type: 'tap' }, 'tap-a');
  const twice = roomAfterOnlineAction(once, 'alice', { type: 'tap' }, 'tap-a');
  assert.equal(twice.state.scores.alice, 1);
  assert.equal(twice.state.moves, 1);
  assert.equal(onlineRevision(twice.state), 1);
});

test('fast inputs are safe to commit as one transaction batch', () => {
  const entries = Array.from({ length: 6 }, (_, index) => ({
    id: `tap-${index}`,
    action: { type: 'tap' },
  }));
  const result = roomAfterOnlineActions(room('pixel-tap'), 'alice', entries);
  assert.equal(result.room.state.scores.alice, 6);
  assert.equal(result.room.state.moves, 6);
  assert.equal(onlineRevision(result.room.state), 6);
  assert.deepEqual(result.appliedIds, entries.map((entry) => entry.id));
});

test('pending local inputs rebase over a simultaneous remote move', () => {
  const serverRoom = roomAfterOnlineAction(room('pixel-tap'), 'bob', { type: 'tap' }, 'bob-tap');
  const result = roomAfterOnlineActions(serverRoom, 'alice', [
    { id: 'alice-1', action: { type: 'tap' } },
    { id: 'alice-2', action: { type: 'tap' } },
  ]);
  assert.equal(result.room.state.scores.bob, 1);
  assert.equal(result.room.state.scores.alice, 2);
  assert.equal(result.room.state.moves, 3);
});

test('the idempotency history stays bounded during long matches', () => {
  let gameState = { phase: 'playing', moves: 0 };
  for (let index = 0; index < ONLINE_ACTION_HISTORY_LIMIT + 20; index += 1) {
    gameState = markOnlineAction(gameState, `action-${index}`);
  }
  assert.equal(gameState.onlineSync.recentActionIds.length, ONLINE_ACTION_HISTORY_LIMIT);
  assert.equal(hasOnlineAction(gameState, 'action-0'), false);
  assert.equal(hasOnlineAction(gameState, `action-${ONLINE_ACTION_HISTORY_LIMIT + 19}`), true);
});

test('a rematch keeps the online revision monotonic and clears old action ids', () => {
  const played = markOnlineAction(room('pixel-tac-toe').state, 'winning-move');
  const fresh = createInitialGameState('pixel-tac-toe', players, 'rematch');
  const reset = markOnlineReset(fresh, played);
  assert.equal(onlineRevision(reset), onlineRevision(played) + 1);
  assert.deepEqual(reset.onlineSync.recentActionIds, []);
  assert.equal(reset.moves, 0);
});
