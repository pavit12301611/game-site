import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../../src/catalog.js';
import * as maze from '../../src/engines/maze.js';

const two = [{ uid: 'p1', name: 'One' }, { uid: 'p2', name: 'Two' }];
const three = [...two, { uid: 'p3', name: 'Three' }];
const mazeRunner = GAMES.find((game) => game.id === 'maze-runner');

function start(players = two) {
  return maze.createInitialState(mazeRunner, players);
}

test('every player starts on the bottom row, spaced apart, with the star gate at the top right', () => {
  const state = start(three);
  assert.equal(state.width, 7);
  assert.equal(state.height, 7);
  assert.deepEqual(state.goal, { x: 6, y: 0 });
  assert.deepEqual(state.positions, {
    p1: { x: 0, y: 6 },
    p2: { x: 2, y: 6 },
    p3: { x: 4, y: 6 },
  });
  assert.equal(state.turnUid, null, 'the race is simultaneous');
  assert.ok(state.walls.every((index) => index >= 0 && index < 49), 'every wall is inside the board');
});

test('a legal move updates one position and counts the step', () => {
  let state = start();
  state = maze.applyAction(mazeRunner, state, 'p1', { direction: 'up' }, two);
  assert.deepEqual(state.positions.p1, { x: 0, y: 5 });
  assert.equal(state.scores.p1, 1);
  assert.deepEqual(state.positions.p2, { x: 2, y: 6 }, 'the other player does not move');
});

test('walls and the board edge block movement', () => {
  const state = start();
  assert.throws(() => maze.applyAction(mazeRunner, state, 'p2', { direction: 'up' }, two), /wall in the way/i, 'cell 37 is a wall');
  assert.throws(() => maze.applyAction(mazeRunner, state, 'p1', { direction: 'down' }, two), /wall in the way/i, 'off the bottom edge');
  assert.throws(() => maze.applyAction(mazeRunner, state, 'p1', { direction: 'left' }, two), /wall in the way/i, 'off the left edge');
  assert.throws(() => maze.applyAction(mazeRunner, state, 'p1', { direction: 'sideways' }, two), /choose a direction/i);
});

test('tagging the star gate wins the race and stops the game', () => {
  let state = start();
  state.positions.p1 = { x: 5, y: 0 };
  state = maze.applyAction(mazeRunner, state, 'p1', { direction: 'right' }, two);
  assert.deepEqual(state.positions.p1, { x: 6, y: 0 });
  assert.equal(state.phase, 'finished');
  assert.equal(state.winnerUid, 'p1');
  assert.equal(state.result, 'winner');
  assert.throws(() => maze.applyAction(mazeRunner, state, 'p2', { direction: 'up' }, two), /already over/i);
});

test('steps are counted per player, so the shortest route leads', () => {
  let state = start();
  state = maze.applyAction(mazeRunner, state, 'p1', { direction: 'up' }, two);
  state = maze.applyAction(mazeRunner, state, 'p1', { direction: 'up' }, two);
  state = maze.applyAction(mazeRunner, state, 'p2', { direction: 'right' }, two);
  assert.deepEqual(state.scores, { p1: 2, p2: 1 });
});
