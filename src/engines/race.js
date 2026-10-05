/**
 * race engine — real-time button mashing, no turns: first player to the target score wins.
 *
 * `tapGapMs` is the tempo of the game: the shortest interval between two taps that count. It is a
 * real rule difference between the six races (Pixel Tap Sprint accepts every tap, Bug Blaster one
 * every 250 ms), and in online play the trusted backend enforces the same number, so a script that
 * fires thousands of taps a second gains nothing.
 * Games: Pixel Tap Sprint, Button Masher, Turbo Charge, Reaction Rush, Spacebar Showdown, Bug Blaster.
 */

/** @typedef {import('../types.js').Game} Game */
/** @typedef {import('../types.js').Player} Player */
/** @typedef {import('../types.js').GameState} GameState */
/** @typedef {import('../types.js').Action} Action */

import { assertPlaying, createRaceState } from './shared.js';

/**
 * @param {Game} game
 * @param {Player[]} players
 * @returns {GameState}
 */
export function createInitialState(game, players) {
  return { ...createRaceState(game, players), tapGapMs: Number(game.options.tapGapMs) || 0 };
}

/**
 * @param {Game} game
 * @param {GameState} state
 * @param {string} uid
 * @param {Action} action
 * @returns {GameState}
 */
export function applyAction(game, state, uid, action) {
  assertPlaying(state);
  if (action.type !== 'tap') throw new Error('Tap the boost button to score.');
  const scoreMap = { ...state.scores, [uid]: (state.scores[uid] ?? 0) + 1 };
  state.scores = scoreMap;
  state.moves += 1;
  state.lastAction = { uid, time: state.moves };
  if (scoreMap[uid] >= state.target) {
    state.phase = 'finished';
    state.winnerUid = uid;
    state.result = 'winner';
  }
  return state;
}
