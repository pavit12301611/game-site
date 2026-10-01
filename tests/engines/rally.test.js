import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../../src/catalog.js';
import * as rally from '../../src/engines/rally.js';

const two = [{ uid: 'p1', name: 'One' }, { uid: 'p2', name: 'Two' }];
const pong = GAMES.find((game) => game.id === 'pong-rally');

test('a rally alternates volleys, starting with the first player', () => {
  const state = rally.createInitialState(pong, two);
  assert.equal(state.turnUid, 'p1');
  assert.equal(state.target, 7);
  assert.deepEqual(state.scores, { p1: 0, p2: 0 });
});

test('each clean volley scores and hands the rally over', () => {
  let state = rally.createInitialState(pong, two);
  state = rally.applyAction(pong, state, 'p1', { lane: 0 }, two);
  assert.deepEqual(state.lastAction, { uid: 'p1', lane: 0, move: 1 });
  assert.equal(state.scores.p1, 1);
  assert.equal(state.turnUid, 'p2');
  state = rally.applyAction(pong, state, 'p2', { lane: 2 }, two);
  assert.equal(state.scores.p2, 1);
  assert.equal(state.turnUid, 'p1');
});

test('the first player to the target takes the match', () => {
  let state = rally.createInitialState(pong, two);
  for (let volley = 0; volley < 13 && state.phase === 'playing'; volley += 1) {
    state = rally.applyAction(pong, state, state.turnUid, { lane: volley % 3 }, two);
  }
  assert.equal(state.phase, 'finished');
  assert.equal(state.winnerUid, 'p1');
  assert.equal(state.scores.p1, 7);
  assert.equal(state.scores.p2, 6);
  assert.throws(() => rally.applyAction(pong, state, 'p2', { lane: 0 }, two), /already over/i);
});

test('only the three lanes on screen are playable', () => {
  const state = rally.createInitialState(pong, two);
  assert.throws(() => rally.applyAction(pong, state, 'p1', { lane: 3 }, two), /choose a volley lane/i);
  assert.throws(() => rally.applyAction(pong, state, 'p1', { lane: -1 }, two), /choose a volley lane/i);
  assert.throws(() => rally.applyAction(pong, state, 'p1', { lane: 1.5 }, two), /choose a volley lane/i);
  assert.throws(() => rally.applyAction(pong, state, 'p2', { lane: 0 }, two), /wait for your turn/i);
});
