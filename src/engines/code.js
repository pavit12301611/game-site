/**
 * code engine — Mastermind. The secret sequence is generated from the room seed, so every client
 * deals the same code without ever sending it to the browser in plain sight.
 * Games: Codebreaker, Mastermind.
 */

/** @typedef {import('../types.js').Game} Game */
/** @typedef {import('../types.js').Player} Player */
/** @typedef {import('../types.js').GameState} GameState */
/** @typedef {import('../types.js').Action} Action */

import { advanceTurn, assertPlaying, assertTurn, makeRandom, newBase } from './shared.js';

/**
 * @param {Game} game
 * @param {Player[]} players
 * @param {string} [seed]
 * @returns {GameState}
 */
export function createInitialState(game, players, seed) {
  const random = makeRandom(`${seed}:${game.id}:code`);
  const digits = game.options.digits;
  const secret = Array.from({ length: digits }, () => Math.floor(random() * 6));
  return {
    ...newBase(players),
    secret,
    guesses: [],
    digits,
    maxGuesses: game.options.maxGuesses,
    turnIndex: 0,
  };
}

/**
 * @param {Game} game
 * @param {GameState} state
 * @param {string} uid
 * @param {Action} action
 * @param {Player[]} players
 * @returns {GameState}
 */
export function applyAction(game, state, uid, action, players) {
  assertPlaying(state);
  assertTurn(state, uid);
  const guess = Array.isArray(action.guess) ? action.guess.map(Number) : [];
  if (guess.length !== state.digits || guess.some((digit) => !Number.isInteger(digit) || digit < 0 || digit > 5)) {
    throw new Error('Enter a valid sequence of four digits.');
  }
  const exact = guess.reduce((count, digit, index) => count + (digit === state.secret[index] ? 1 : 0), 0);
  const unmatchedSecret = [];
  const unmatchedGuess = [];
  for (let index = 0; index < state.digits; index += 1) {
    if (guess[index] !== state.secret[index]) {
      unmatchedGuess.push(guess[index]);
      unmatchedSecret.push(state.secret[index]);
    }
  }
  let misplaced = 0;
  for (const digit of unmatchedGuess) {
    const found = unmatchedSecret.indexOf(digit);
    if (found !== -1) {
      misplaced += 1;
      unmatchedSecret.splice(found, 1);
    }
  }
  state.guesses = [...state.guesses, { uid, guess, exact, misplaced }];
  state.moves += 1;
  if (exact === state.digits) {
    state.phase = 'finished';
    state.winnerUid = uid;
    state.result = 'winner';
  } else if (state.guesses.length >= state.maxGuesses) {
    state.phase = 'finished';
    state.result = 'draw';
  } else {
    advanceTurn(state, players, uid);
  }
  return state;
}
