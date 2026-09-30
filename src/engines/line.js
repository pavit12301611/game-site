/**
 * line engine — place a mark on a square grid and connect N in a row.
 * Games: Pixel Tic-Tac-Toe (3x3, connect 3), Neon Gomoku (9x9, connect 5).
 */
import { advanceTurn, assertPlaying, assertTurn, newBase, resolveLineWinner } from './shared.js';

export function createInitialState(game, players) {
  const size = game.options.size;
  return {
    ...newBase(players),
    board: Array(size * size).fill(null),
    size,
    connect: game.options.connect,
  };
}

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
