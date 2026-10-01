import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../../src/catalog.js';
import * as drop from '../../src/engines/drop.js';

const two = [{ uid: 'p1', name: 'One' }, { uid: 'p2', name: 'Two' }];
const connectFour = GAMES.find((game) => game.id === 'connect-four');
const fiveInRow = GAMES.find((game) => game.id === 'five-in-row');

function play(moves, players = two, game = connectFour) {
  let state = drop.createInitialState(game, players);
  for (const col of moves) state = drop.applyAction(game, state, state.turnUid, { col }, players);
  return state;
}

test('a new drop board is empty and remembers its shape', () => {
  const state = drop.createInitialState(connectFour, two);
  assert.equal(state.board.length, 42);
  assert.equal(state.cols, 7);
  assert.equal(state.rows, 6);
  assert.equal(state.connect, 4);
  assert.equal(state.turnUid, 'p1');
});

test('tokens fall to the lowest free cell in the column', () => {
  let state = drop.createInitialState(connectFour, two);
  state = drop.applyAction(connectFour, state, 'p1', { col: 0 }, two);
  assert.equal(state.board[5 * 7 + 0], 'p1', 'the first token lands on the bottom row');
  state = drop.applyAction(connectFour, state, 'p2', { col: 0 }, two);
  assert.equal(state.board[4 * 7 + 0], 'p2', 'the second token stacks on top of it');
  state = drop.applyAction(connectFour, state, 'p1', { col: 0 }, two);
  assert.equal(state.board[3 * 7 + 0], 'p1');
  assert.equal(state.board[5 * 7 + 0], 'p1', 'the bottom token never moves');
});

test('four in a row along the bottom wins', () => {
  const state = play([0, 0, 1, 1, 2, 2, 3]);
  assert.equal(state.phase, 'finished');
  assert.equal(state.winnerUid, 'p1');
  assert.equal(state.result, 'winner');
});

test('four stacked in one column also wins', () => {
  const state = play([0, 1, 0, 1, 0, 1, 0]);
  assert.equal(state.phase, 'finished');
  assert.equal(state.winnerUid, 'p1');
});

test('a diagonal four counts on the drop board', () => {
  // p1 builds 0,1,2,3 diagonally by using the stacking of the previous columns.
  const state = play([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
  assert.equal(state.winnerUid, 'p1', 'p1 completes a rising diagonal');
  assert.equal(state.phase, 'finished');
});

test('connect 5 rules apply to the roomier board', () => {
  const state = drop.createInitialState(fiveInRow, two);
  assert.equal(state.cols, 8);
  assert.equal(state.rows, 7);
  assert.equal(state.connect, 5);
});

test('a full column is refused and every other column still works', () => {
  let state = drop.createInitialState(connectFour, two);
  for (let row = 0; row < 6; row += 1) {
    state = drop.applyAction(connectFour, state, state.turnUid, { col: 0 }, two);
  }
  assert.throws(() => drop.applyAction(connectFour, state, state.turnUid, { col: 0 }, two), /column is full/i);
  assert.doesNotThrow(() => drop.applyAction(connectFour, state, state.turnUid, { col: 1 }, two));
});

test('illegal drops are refused with a readable reason', () => {
  const state = drop.createInitialState(connectFour, two);
  assert.throws(() => drop.applyAction(connectFour, state, 'p1', { col: 7 }, two), /not available/i, 'a column off the board');
  assert.throws(() => drop.applyAction(connectFour, state, 'p1', { col: -1 }, two), /not available/i, 'a negative column');
  assert.throws(() => drop.applyAction(connectFour, state, 'p2', { col: 3 }, two), /wait for your turn/i, 'dropping out of turn');
});
