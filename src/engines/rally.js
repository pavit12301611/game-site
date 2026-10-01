/**
 * rally engine — alternating volleys: pick a lane, score a point, first to the target wins.
 * Games: Pong Rally, Paddle Wars, Air Hockey.
 */

/** @typedef {import('../types.js').Game} Game */
/** @typedef {import('../types.js').Player} Player */
/** @typedef {import('../types.js').GameState} GameState */
/** @typedef {import('../types.js').Action} Action */

import { advanceTurn, assertPlaying, assertTurn, createRaceState } from './shared.js';

/**
 * @param {Game} game
 * @param {Player[]} players
 * @returns {GameState}
 */
export function createInitialState(game, players) {
  return createRaceState(game, players);
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
  const lane = Number(action.lane);
  if (!Number.isInteger(lane) || lane < 0 || lane > 2) throw new Error('Choose a volley lane.');
  const scoreMap = { ...state.scores, [uid]: (state.scores[uid] ?? 0) + 1 };
  state.scores = scoreMap;
  state.moves += 1;
  state.lastAction = { uid, lane, move: state.moves };
  if (scoreMap[uid] >= state.target) {
    state.phase = 'finished';
    state.winnerUid = uid;
    state.result = 'winner';
  } else {
    advanceTurn(state, players, uid);
  }
  return state;
}
