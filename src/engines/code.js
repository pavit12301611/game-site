/**
 * code engine — Mastermind. The secret sequence is generated from the room seed. In online play the
 * generated state (including `secret`) is kept in a server-only document: clients receive the guess
 * history with its EXACT/NEAR counts and only learn the code once `revealedSecret` is published at
 * the end of the match.
 *
 * `symbols` is how many different digits the code may use, so Mastermind (four symbols, five slots,
 * eight guesses) plays differently from Codebreaker (six symbols, four slots, ten guesses).
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
  const symbols = Number(game.options.symbols) || 6;
  const secret = Array.from({ length: digits }, () => Math.floor(random() * symbols));
  return {
    ...newBase(players),
    secret,
    guesses: [],
    digits,
    symbols,
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
  const symbols = state.symbols || 6;
  if (guess.length !== state.digits || guess.some((digit) => !Number.isInteger(digit) || digit < 0 || digit >= symbols)) {
    throw new Error(`Enter ${state.digits} digits from 0 to ${symbols - 1}.`);
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
    state.revealedSecret = [...state.secret];
  } else if (state.guesses.length >= state.maxGuesses) {
    state.phase = 'finished';
    state.result = 'draw';
  } else {
    advanceTurn(state, players, uid);
  }
  return state;
}
