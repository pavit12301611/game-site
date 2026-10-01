/**
 * line engine — place a mark on a square grid and connect N in a row.
 * Games: Pixel Tic-Tac-Toe (3x3, connect 3), Neon Gomoku (9x9, connect 5).
 */

/** @typedef {import('../types.js').Game} Game */
/** @typedef {import('../types.js').Player} Player */
/** @typedef {import('../types.js').GameState} GameState */
/** @typedef {import('../types.js').Action} Action */

import { advanceTurn, assertPlaying, assertTurn, newBase, resolveLineWinner } from './shared.js';

/**
 * @param {Game} game
 * @param {Player[]} players
 * @returns {GameState}
 */
export function createInitialState(game, players) {
  const size = game.options.size;
  return {
    ...newBase(players),
    board: Array(size * size).fill(null),
    size,
    connect: game.options.connect,
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
  const index = Number(action.index);
  if (!Number.isInteger(index) || index < 0 || index >= state.board.length || state.board[index] !== null) {
    throw new Error('That square is not available.');
  }
  state.board[index] = uid;
  state.moves += 1;
  if (resolveLineWinner(state.board, state.size, index, uid, state.connect)) {
    state.phase = 'finished';
    state.winnerUid = uid;
    state.result = 'winner';
  } else if (state.board.every(Boolean)) {
    state.phase = 'finished';
    state.result = 'draw';
  } else {
    advanceTurn(state, players, uid);
  }
  return state;
}
