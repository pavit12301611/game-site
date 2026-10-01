import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceTurn,
  assertPlaying,
  assertTurn,
  hashNumber,
  makeRandom,
  nextPlayer,
  resolveLineWinner,
  shuffled,
  winnerFromScores,
} from '../../src/engines/shared.js';

const players = [{ uid: 'p1' }, { uid: 'p2' }, { uid: 'p3' }];

test('makeRandom is deterministic for a seed and different across seeds', () => {
  const a = makeRandom('room-1');
  const b = makeRandom('room-1');
  const c = makeRandom('room-2');
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  const seqC = [c(), c(), c()];
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  assert.ok(seqA.every((value) => value >= 0 && value < 1));
});

test('hashNumber is stable, unsigned and order sensitive', () => {
  assert.equal(hashNumber('psd'), hashNumber('psd'));
  assert.notEqual(hashNumber('psd'), hashNumber('spd'));
  assert.ok(hashNumber('anything') >= 0);
});

test('shuffled keeps every item and follows the seed', () => {
  const items = [1, 2, 3, 4, 5, 6];
  const first = shuffled(items, 'deck');
  assert.deepEqual(first, shuffled(items, 'deck'));
  assert.deepEqual([...first].sort(), items);
  assert.notDeepEqual(first, shuffled(items, 'other-deck'));
  assert.deepEqual(items, [1, 2, 3, 4, 5, 6], 'the input array is not modified');
});

test('nextPlayer wraps around the player list', () => {
  assert.equal(nextPlayer(players, 'p1'), 'p2');
  assert.equal(nextPlayer(players, 'p3'), 'p1');
  assert.equal(nextPlayer(players, 'nobody'), 'p1', 'an unknown uid falls back to the first player instead of crashing');
});

test('winnerFromScores needs a single clear leader', () => {
  assert.equal(winnerFromScores(players, { p1: 3, p2: 1, p3: 1 }), 'p1');
  assert.equal(winnerFromScores(players, { p1: 2, p2: 2, p3: 1 }), null, 'a tie for the lead is not a win');
  assert.equal(winnerFromScores(players, {}), null, 'an all-zero board is not a win');
});

test('resolveLineWinner checks rows, columns and both diagonals', () => {
  const size = 4;
  const board = Array(size * size).fill(null);
  for (const col of [0, 1, 2]) board[2 * size + col] = 'p1';
  assert.equal(resolveLineWinner(board, size, 2 * size + 2, 'p1', 3), true, 'a horizontal three');
  for (const row of [0, 1, 2]) board[row * size + 0] = 'p2';
  assert.equal(resolveLineWinner(board, size, 2 * size + 0, 'p2', 3), true, 'a vertical three');
  const diagonal = Array(size * size).fill(null);
  diagonal[0] = 'p1'; diagonal[size + 1] = 'p1'; diagonal[2 * size + 2] = 'p1';
  assert.equal(resolveLineWinner(diagonal, size, 2 * size + 2, 'p1', 3), true, 'the main diagonal');
  const anti = Array(size * size).fill(null);
  anti[2] = 'p1'; anti[size + 1] = 'p1'; anti[2 * size] = 'p1';
  assert.equal(resolveLineWinner(anti, size, 2 * size, 'p1', 3), true, 'the anti diagonal');
  assert.equal(resolveLineWinner(board, size, 2 * size + 2, 'p2', 3), false, 'three for the wrong player');
  assert.equal(resolveLineWinner(board, size, 2 * size + 2, 'p1', 4), false, 'one short of the target');
});

test('turn guards explain themselves to the player', () => {
  assert.throws(() => assertPlaying({ phase: 'finished' }), /already over/i);
  assert.doesNotThrow(() => assertPlaying({ phase: 'playing' }));
  assert.throws(() => assertTurn({ turnUid: 'p2' }, 'p1'), /wait for your turn/i);
  assert.doesNotThrow(() => assertTurn({ turnUid: 'p1' }, 'p1'));
  assert.doesNotThrow(() => assertTurn({ turnUid: null }, 'p3'), 'engines without turns never block');
});

test('advanceTurn hands the turn to the next player', () => {
  const state = { turnUid: 'p1' };
  advanceTurn(state, players, 'p1');
  assert.equal(state.turnUid, 'p2');
  advanceTurn(state, players, 'p2');
  assert.equal(state.turnUid, 'p3');
  advanceTurn(state, players, 'p3');
  assert.equal(state.turnUid, 'p1');
});
