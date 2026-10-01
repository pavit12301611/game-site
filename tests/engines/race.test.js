import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../../src/catalog.js';
import * as race from '../../src/engines/race.js';

const three = [{ uid: 'p1', name: 'One' }, { uid: 'p2', name: 'Two' }, { uid: 'p3', name: 'Three' }];
const sprint = GAMES.find((game) => game.id === 'pixel-tap');

test('a race has no turns: anybody can tap at any time', () => {
  const state = race.createInitialState(sprint, three);
  assert.equal(state.turnUid, null);
  assert.equal(state.target, 16);
  assert.deepEqual(state.scores, { p1: 0, p2: 0, p3: 0 });
  assert.equal(state.lastAction, null);
});

test('every tap adds one boost to the tapping player only', () => {
  let state = race.createInitialState(sprint, three);
  state = race.applyAction(sprint, state, 'p1', { type: 'tap' }, three);
  state = race.applyAction(sprint, state, 'p2', { type: 'tap' }, three);
  state = race.applyAction(sprint, state, 'p2', { type: 'tap' }, three);
  assert.deepEqual(state.scores, { p1: 1, p2: 2, p3: 0 });
  assert.equal(state.moves, 3);
  assert.deepEqual(state.lastAction, { uid: 'p2', time: 3 });
});

test('the first player to reach the target wins outright', () => {
  let state = race.createInitialState(sprint, three);
  for (let tap = 0; tap < 26 && state.phase === 'playing'; tap += 1) {
    state = race.applyAction(sprint, state, tap % 4 === 3 ? 'p2' : 'p1', { type: 'tap' }, three);
  }
  assert.equal(state.phase, 'finished');
  assert.equal(state.winnerUid, 'p1');
  assert.equal(state.scores.p1, 16);
  assert.equal(state.result, 'winner');
});

test('anything that is not a tap is refused', () => {
  const state = race.createInitialState(sprint, three);
  assert.throws(() => race.applyAction(sprint, state, 'p1', { type: 'boost' }, three), /tap the boost button/i);
  assert.throws(() => race.applyAction(sprint, state, 'p1', {}, three), /tap the boost button/i);
});

test('the race engine never lets a finished game be tapped again', () => {
  let state = race.createInitialState(sprint, three);
  for (let tap = 0; tap < 16; tap += 1) state = race.applyAction(sprint, state, 'p1', { type: 'tap' }, three);
  assert.equal(state.phase, 'finished');
  assert.throws(() => race.applyAction(sprint, state, 'p2', { type: 'tap' }, three), /already over/i);
});
