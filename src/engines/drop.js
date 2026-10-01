/**
 * drop engine — gravity board: pick a column, the token falls to the lowest free cell.
 * Games: Connect Four (7x6, connect 4), Five in a Row (8x7, connect 5).
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
  const { cols, rows } = game.options;
  return {
    ...newBase(players),
    board: Array(cols * rows).fill(null),
    cols,
    rows,
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
  const col = Number(action.col);
  if (!Number.isInteger(col) || col < 0 || col >= state.cols) throw new Error('That column is not available.');
  let row = state.rows - 1;
  while (row >= 0 && state.board[row * state.cols + col] !== null) row -= 1;
  if (row < 0) throw new Error('That column is full.');
  const index = row * state.cols + col;
  state.board[index] = uid;
  state.moves += 1;
  if (resolveLineWinner(state.board, state.cols, index, uid, state.connect)) {
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
