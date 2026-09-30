import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../../src/catalog.js';
import * as memory from '../../src/engines/memory.js';

const two = [{ uid: 'p1', name: 'One' }, { uid: 'p2', name: 'Two' }];
const three = [...two, { uid: 'p3', name: 'Three' }];
const memoryMatch = GAMES.find((game) => game.id === 'memory-match');
const arcadePairs = GAMES.find((game) => game.id === 'arcade-pairs');

function start(game = memoryMatch, players = two, seed = 'memory-seed') {
  return memory.createInitialState(game, players, seed);
}

/** Two hidden cards that show the same face. */
function findPair(state, exclude = []) {
  for (let a = 0; a < state.cards.length; a += 1) {
    if (state.matched.includes(a) || exclude.includes(a)) continue;
    for (let b = a + 1; b < state.cards.length; b += 1) {
      if (state.matched.includes(b) || exclude.includes(b)) continue;
      if (state.cards[a] === state.cards[b]) return [a, b];
    }
  }
  return [];
}

/** Two hidden cards with different faces. */
function findMismatch(state) {
  for (let a = 0; a < state.cards.length; a += 1) {
    if (state.matched.includes(a)) continue;
    for (let b = a + 1; b < state.cards.length; b += 1) {
      if (state.matched.includes(b)) continue;
      if (state.cards[a] !== state.cards[b]) return [a, b];
    }
  }
  return [];
}

test('the deck deals every symbol exactly twice, shuffled from the seed', () => {
  const state = start();
  assert.equal(state.cards.length, 12, 'six pairs means twelve cards');
  const counts = new Map();
  for (const card of state.cards) counts.set(card, (counts.get(card) || 0) + 1);
  assert.equal(counts.size, 6);
  assert.ok([...counts.values()].every((count) => count === 2));
  assert.deepEqual(start(memoryMatch, two, 'memory-seed').cards, state.cards, 'the same seed deals the same deck');
  assert.notDeepEqual(start(memoryMatch, two, 'another-seed').cards, state.cards, 'a new seed reshuffles');
  assert.equal(state.turnUid, 'p1');
  assert.deepEqual(state.scores, { p1: 0, p2: 0 });
});

test('a match scores a point and keeps the turn', () => {
  let state = start();
  const [a, b] = findPair(state);
  state = memory.applyAction(memoryMatch, state, 'p1', { index: a }, two);
  assert.equal(state.turnUid, 'p1', 'the first flip does not pass the turn');
  state = memory.applyAction(memoryMatch, state, 'p1', { index: b }, two);
  assert.deepEqual(state.matched.sort(), [a, b].sort());
  assert.equal(state.scores.p1, 1);
  assert.equal(state.turnUid, 'p1', 'a match earns another turn');
  assert.equal(state.opened.length, 2);
});

test('a miss passes the turn and leaves the cards face up for one flip', () => {
  let state = start();
  const [a, b] = findMismatch(state);
  state = memory.applyAction(memoryMatch, state, 'p1', { index: a }, two);
  state = memory.applyAction(memoryMatch, state, 'p1', { index: b }, two);
  assert.equal(state.scores.p1, 0);
  assert.equal(state.turnUid, 'p2', 'the turn moves on after a miss');
  const c = state.cards
    .map((_, index) => index)
    .find((index) => !state.matched.includes(index) && !state.opened.includes(index));
  state = memory.applyAction(memoryMatch, state, 'p2', { index: c }, two);
  assert.equal(state.opened.length, 1, 'the board is cleared before the next pair starts');
});

test('clearing the whole deck finishes the game for the highest scorer', () => {
  let state = start(memoryMatch, three);
  for (let round = 0; round < 6 && state.phase === 'playing'; round += 1) {
    const [a, b] = findPair(state);
    state = memory.applyAction(memoryMatch, state, 'p1', { index: a }, three);
    state = memory.applyAction(memoryMatch, state, 'p1', { index: b }, three);
  }
  assert.equal(state.matched.length, state.cards.length);
  assert.equal(state.phase, 'finished');
  assert.equal(state.winnerUid, 'p1');
  assert.equal(state.scores.p1, 6);
});

test('the pair count follows the game options', () => {
  assert.equal(start(arcadePairs).cards.length, 16, 'eight pairs');
  assert.ok(memory.MEMORY_ICONS.length >= 8, 'the icon set can deal the biggest deck in the catalog');
});

test('illegal flips are refused with a readable reason', () => {
  let state = start();
  const [a, b] = findPair(state);
  assert.throws(() => memory.applyAction(memoryMatch, state, 'p2', { index: a }, two), /wait for your turn/i);
  assert.throws(() => memory.applyAction(memoryMatch, state, 'p1', { index: 12 }, two), /not available/i, 'off the deck');
  state = memory.applyAction(memoryMatch, state, 'p1', { index: a }, two);
  assert.throws(() => memory.applyAction(memoryMatch, state, 'p1', { index: a }, two), /flip a different card/i, 'the same card twice');
  state = memory.applyAction(memoryMatch, state, 'p1', { index: b }, two);
  assert.throws(() => memory.applyAction(memoryMatch, state, 'p1', { index: a }, two), /not available/i, 'a matched card');
});

test('the card face helper always returns a symbol', () => {
  assert.equal(memory.memoryCardIcon(0), memory.MEMORY_ICONS[0]);
  assert.equal(memory.memoryCardIcon(memory.MEMORY_ICONS.length), memory.MEMORY_ICONS[0], 'it wraps around');
});
