import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../../src/catalog.js';
import * as code from '../../src/engines/code.js';

const two = [{ uid: 'p1', name: 'One' }, { uid: 'p2', name: 'Two' }];
const codebreaker = GAMES.find((game) => game.id === 'codebreaker');

function start(seed = 'code-seed') {
  return code.createInitialState(codebreaker, two, seed);
}

/** A digit that is not part of the secret, so a guess built from it scores nothing. */
function unusedDigit(secret) {
  for (let digit = 0; digit <= 5; digit += 1) if (!secret.includes(digit)) return digit;
  throw new Error('the secret uses every digit');
}

test('the secret is four digits from 0-5, dealt from the seed', () => {
  const state = start();
  assert.equal(state.secret.length, 4);
  assert.ok(state.secret.every((digit) => Number.isInteger(digit) && digit >= 0 && digit <= 5));
  assert.deepEqual(start('code-seed').secret, state.secret, 'the same seed deals the same code');
  assert.notDeepEqual(start('another-seed').secret, state.secret, 'a new room gets a new code');
  assert.deepEqual(state.guesses, []);
  assert.equal(state.maxGuesses, 10);
  assert.equal(state.turnUid, 'p1');
});

test('a guess reports exact and misplaced digits', () => {
  const state = start();
  const wrong = unusedDigit(state.secret);
  const blank = code.applyAction(codebreaker, state, 'p1', { guess: [wrong, wrong, wrong, wrong] }, two);
  assert.deepEqual(blank.guesses[0], { uid: 'p1', guess: [wrong, wrong, wrong, wrong], exact: 0, misplaced: 0 });
  assert.equal(blank.turnUid, 'p2');
  assert.equal(blank.phase, 'playing');
});

test('a digit in the wrong place is NEAR, not EXACT', () => {
  // Find a seed whose secret has four different digits, then swap the two pairs: two digits stay put
  // (EXACT) and the other two are still in the code but in the wrong slot (NEAR).
  let state = start();
  for (let seed = 0; seed < 50 && new Set(state.secret).size !== 4; seed += 1) state = start(`distinct-${seed}`);
  assert.equal(new Set(state.secret).size, 4, 'a test secret with four different digits exists');
  const [a, b, c, d] = state.secret;
  const next = code.applyAction(codebreaker, state, 'p1', { guess: [b, a, c, d] }, two);
  assert.deepEqual(
    { exact: next.guesses[0].exact, misplaced: next.guesses[0].misplaced },
    { exact: 2, misplaced: 2 },
    'the last two digits are right, the first two are only in the code somewhere else',
  );
});

test('cracking the code wins immediately', () => {
  const state = start();
  const next = code.applyAction(codebreaker, state, 'p1', { guess: [...state.secret] }, two);
  assert.equal(next.guesses[0].exact, 4);
  assert.equal(next.phase, 'finished');
  assert.equal(next.winnerUid, 'p1');
  assert.equal(next.result, 'winner');
});

test('running out of guesses is a draw', () => {
  let state = start();
  const wrong = unusedDigit(state.secret);
  for (let guess = 0; guess < 10; guess += 1) {
    state = code.applyAction(codebreaker, state, state.turnUid, { guess: [wrong, wrong, wrong, wrong] }, two);
  }
  assert.equal(state.guesses.length, 10);
  assert.equal(state.phase, 'finished');
  assert.equal(state.result, 'draw');
  assert.equal(state.winnerUid, null);
});

test('illegal guesses are refused with a readable reason', () => {
  const state = start();
  assert.throws(() => code.applyAction(codebreaker, state, 'p1', { guess: [1, 2, 3] }, two), /Enter 4 digits from 0 to 5/i, 'too short');
  assert.throws(() => code.applyAction(codebreaker, state, 'p1', { guess: [1, 2, 3, 4, 5] }, two), /Enter 4 digits from 0 to 5/i, 'too long');
  assert.throws(() => code.applyAction(codebreaker, state, 'p1', { guess: [1, 2, 3, 9] }, two), /Enter 4 digits from 0 to 5/i, 'a digit above 5');
  assert.throws(() => code.applyAction(codebreaker, state, 'p1', { guess: '1234' }, two), /Enter 4 digits from 0 to 5/i, 'not an array');
  assert.throws(() => code.applyAction(codebreaker, state, 'p2', { guess: [1, 2, 3, 4] }, two), /wait for your turn/i);
});
