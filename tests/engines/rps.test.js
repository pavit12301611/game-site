import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, applyGameAction } from '../../src/catalog.js';
import * as rps from '../../src/engines/rps.js';

const two = [{ uid: 'p1', name: 'One' }, { uid: 'p2', name: 'Two' }];
const three = [...two, { uid: 'p3', name: 'Three' }];
const duel = GAMES.find((game) => game.id === 'rock-paper-scissors');
const coin = GAMES.find((game) => game.id === 'coin-flip-clash');
const dice = GAMES.find((game) => game.id === 'dice-duel');

function start(game = duel, players = two, seed = 'duel-seed') {
  return rps.createInitialState(game, players, seed);
}

test('the mode decides which choices are legal', () => {
  assert.deepEqual(rps.choicesForMode('rps'), ['rock', 'paper', 'scissors']);
  assert.deepEqual(rps.choicesForMode('coin'), ['heads', 'tails']);
  assert.equal(rps.choicesForMode('dice').length, 6);
  const state = start();
  assert.equal(state.turnUid, null, 'everyone picks at the same time');
  assert.equal(state.target, 3);
  assert.deepEqual(state.picks, {});
  assert.equal(state.round, 1);
});

test('a round resolves only once everyone has locked in', () => {
  let state = start();
  state = rps.applyAction(duel, state, 'p1', { choice: 'rock' }, two);
  assert.deepEqual(state.picks, { p1: 'rock' });
  assert.equal(state.round, 1, 'the round is still open');
  state = rps.applyAction(duel, state, 'p2', { choice: 'scissors' }, two);
  assert.deepEqual(state.picks, {}, 'the picks are cleared for the next round');
  assert.equal(state.round, 2);
  assert.deepEqual(state.scores, { p1: 1, p2: 0 }, 'rock beats scissors');
  assert.deepEqual(state.lastRound.winnerUids, ['p1']);
});

test('a three-way rock-paper-scissors round can have no winner at all', () => {
  let state = start(duel, three);
  state = rps.applyAction(duel, state, 'p1', { choice: 'rock' }, three);
  state = rps.applyAction(duel, state, 'p2', { choice: 'paper' }, three);
  state = rps.applyAction(duel, state, 'p3', { choice: 'scissors' }, three);
  assert.equal(state.lastRound.winnerUids.length, 3, 'rock, paper and scissors each beat one rival');
  assert.deepEqual(state.scores, { p1: 0, p2: 0, p3: 0 }, 'nobody takes the round when everyone beats one rival');
});

test('the highest die face takes the round', () => {
  let state = start(dice);
  state = rps.applyAction(dice, state, 'p1', { choice: '2' }, two);
  state = rps.applyAction(dice, state, 'p2', { choice: '5' }, two);
  assert.deepEqual(state.scores, { p1: 0, p2: 1 });
});

test('two equal dice rolls score nothing', () => {
  let state = start(dice);
  state = rps.applyAction(dice, state, 'p1', { choice: '4' }, two);
  state = rps.applyAction(dice, state, 'p2', { choice: '4' }, two);
  assert.deepEqual(state.scores, { p1: 0, p2: 0 }, 'a shared high roll is not a point');
});

test('the coin flip is derived from the round, so every client agrees', () => {
  const first = start(coin);
  let a = rps.applyAction(coin, first, 'p1', { choice: 'heads' }, two);
  a = rps.applyAction(coin, a, 'p2', { choice: 'tails' }, two);
  const second = start(coin);
  let b = rps.applyAction(coin, second, 'p1', { choice: 'heads' }, two);
  b = rps.applyAction(coin, b, 'p2', { choice: 'tails' }, two);
  assert.deepEqual(a.scores, b.scores, 'the same round flips the same way every time');
  assert.equal(a.scores.p1 + a.scores.p2, 1, 'one of the two callers was right');
});

test('reaching the target score ends the duel', () => {
  let state = start();
  for (let round = 0; round < 3 && state.phase === 'playing'; round += 1) {
    state = rps.applyAction(duel, state, 'p1', { choice: 'rock' }, two);
    state = rps.applyAction(duel, state, 'p2', { choice: 'scissors' }, two);
  }
  assert.equal(state.phase, 'finished');
  assert.equal(state.winnerUid, 'p1');
  assert.equal(state.scores.p1, 3);
});

test('illegal duel moves are refused with a readable reason', () => {
  let state = start();
  assert.throws(() => rps.applyAction(duel, state, 'p1', { choice: 'lizard' }, two), /choose one of the options/i);
  assert.throws(() => rps.applyAction(dice, start(dice), 'p1', { choice: '7' }, two), /choose one of the options/i);
  state = rps.applyAction(duel, state, 'p1', { choice: 'rock' }, two);
  assert.throws(() => rps.applyAction(duel, state, 'p1', { choice: 'paper' }, two), /already locked in/i);
});

test('a stranger cannot lock in a choice through the public API', () => {
  const state = start();
  assert.throws(() => applyGameAction(duel, state, 'nobody', { choice: 'rock' }, two), /not in this game/i);
});
