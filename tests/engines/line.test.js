import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../../src/catalog.js';
import * as line from '../../src/engines/line.js';

const two = [{ uid: 'p1', name: 'One' }, { uid: 'p2', name: 'Two' }];
const three = [...two, { uid: 'p3', name: 'Three' }];
const ticTacToe = GAMES.find((game) => game.id === 'pixel-tac-toe');
const gomoku = GAMES.find((game) => game.id === 'neon-gomoku');

/** Plays `moves` in order, always for whoever the engine says is next. */
function play(moves, players = two, game = ticTacToe) {
  let state = line.createInitialState(game, players);
  for (const index of moves) state = line.applyAction(game, state, state.turnUid, { index }, players);
  return state;
}

test('a new line board is empty, square and ready for the first player', () => {
  const state = line.createInitialState(ticTacToe, two);
  assert.equal(state.board.length, 9);
  assert.ok(state.board.every((cell) => cell === null));
  assert.equal(state.size, 3);
  assert.equal(state.connect, 3);
  assert.equal(state.turnUid, 'p1');
  assert.equal(state.phase, 'playing');
});

test('moves rotate the turn between every player', () => {
  let state = line.createInitialState(ticTacToe, three);
  for (const index of [0, 4, 8]) {
    const uid = state.turnUid;
    state = line.applyAction(ticTacToe, state, uid, { index }, three);
  }
  assert.equal(state.turnUid, 'p1', 'the turn wraps back to the first player');
  assert.deepEqual([...state.board].filter(Boolean), ['p1', 'p2', 'p3']);
});

test('three in a row wins, in every direction', () => {
  for (const [label, moves] of [
    ['row', [0, 3, 1, 4, 2]],
    ['column', [0, 1, 3, 4, 6]],
    ['diagonal', [0, 1, 4, 2, 8]],
    ['anti diagonal', [2, 0, 4, 1, 6]],
  ]) {
    const state = play(moves);
    assert.equal(state.phase, 'finished', `${label} should finish the game`);
    assert.equal(state.winnerUid, 'p1', `${label} should be won by the first player`);
    assert.equal(state.result, 'winner');
  }
});

test('a full board with no line is a draw', () => {
  const state = play([0, 2, 1, 3, 5, 4, 6, 7, 8]);
  assert.ok(state.board.every(Boolean), 'every square is filled');
  assert.equal(state.phase, 'finished');
  assert.equal(state.result, 'draw');
  assert.equal(state.winnerUid, null);
});

test('connect 5 rules apply to the bigger board', () => {
  const state = line.createInitialState(gomoku, two);
  assert.equal(state.size, 9);
  assert.equal(state.connect, 5);
  let live = state;
  for (const index of [0, 9, 1, 10, 2, 11, 3, 12]) {
    live = line.applyAction(gomoku, live, live.turnUid, { index }, two);
  }
  assert.equal(live.phase, 'playing', 'four in a row is not a win on a connect-5 board');
  live = line.applyAction(gomoku, live, live.turnUid, { index: 4 }, two);
  assert.equal(live.phase, 'finished');
  assert.equal(live.winnerUid, 'p1');
});

test('illegal line moves are refused with a readable reason', () => {
  let state = line.createInitialState(ticTacToe, two);
  state = line.applyAction(ticTacToe, state, 'p1', { index: 0 }, two);
  assert.throws(() => line.applyAction(ticTacToe, state, 'p2', { index: 0 }, two), /not available/i, 'an occupied square');
  assert.throws(() => line.applyAction(ticTacToe, state, 'p2', { index: 9 }, two), /not available/i, 'off the board');
  assert.throws(() => line.applyAction(ticTacToe, state, 'p2', { index: -1 }, two), /not available/i, 'a negative square');
  assert.throws(() => line.applyAction(ticTacToe, state, 'p2', { index: 1.5 }, two), /not available/i, 'a fractional square');
  assert.throws(() => line.applyAction(ticTacToe, state, 'p1', { index: 5 }, two), /wait for your turn/i, 'moving out of turn');
  const finished = play([0, 3, 1, 4, 2]);
  assert.throws(() => line.applyAction(ticTacToe, finished, 'p2', { index: 5 }, two), /already over/i);
});
