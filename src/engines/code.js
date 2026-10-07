/**
 * Code engine: codebreaking games (codebreaker, mastermind).
 *
 * Options: { digits: number, maxGuesses: number, symbols: number }
 * A secret code is generated. Players take turns guessing.
 * EXACT = right digit in right position, NEAR = right digit in wrong position.
 */

import { seededRandom, assertPlaying, currentPlayer, advanceTurn, declareWinner, declareDraw, assertTurn } from './shared.js';

export function createInitialState(game, players, seed) {
  const rng = seededRandom(seed);
  const { digits, symbols } = game.options;

  // Generate secret code
  const code = [];
  for (let i = 0; i < digits; i++) {
    code.push(Math.floor(rng() * symbols));
  }

  return {
    engine: 'code',
    code, // hidden: only sent via private view
    digits,
    symbols,
    maxGuesses: game.options.maxGuesses,
    guesses: [], // array of { uid, guess: number[], exact, near }
    turnIndex: 0,
    status: 'playing',
    winner: '',
    seed,
  };
}

export function applyAction(game, state, uid, action, players) {
  assertPlaying(state);
  const current = currentPlayer(state, players);
  assertTurn(uid, current);

  const { guess } = action;
  if (!Array.isArray(guess) || guess.length !== state.digits)
    throw new Error(`Guess must have ${state.digits} digits.`);
  if (guess.some(g => !Number.isInteger(g) || g < 0 || g >= state.symbols))
    throw new Error(`Each digit must be 0–${state.symbols - 1}.`);

  // Calculate exact and near matches
  let exact = 0;
  let near = 0;
  const codeUsed = [...state.code];
  const guessUsed = [...guess];

  // First pass: exact matches
  for (let i = 0; i < state.digits; i++) {
    if (guess[i] === state.code[i]) {
      exact++;
      codeUsed[i] = -1;
      guessUsed[i] = -1;
    }
  }

  // Second pass: near matches
  for (let i = 0; i < state.digits; i++) {
    if (guessUsed[i] === -1) continue;
    const idx = codeUsed.indexOf(guessUsed[i]);
    if (idx !== -1) {
      near++;
      codeUsed[idx] = -1;
    }
  }

  state.guesses.push({ uid, guess: [...guess], exact, near });

  // Win: all exact
  if (exact === state.digits) {
    declareWinner(state, uid);
    return state;
  }

  // Lose: max guesses reached (per player total, not just one player)
  if (state.guesses.length >= state.maxGuesses * players.length) {
    declareDraw(state);
    return state;
  }

  advanceTurn(state, players.length);
  return state;
}