/**
 * Line engine: tic-tac-toe and gomoku (grid tactics).
 *
 * Options: { size: number, connect: number }
 * Board is a flat array of size×size, values are '' or player uid.
 */

import { seededRandom, copy, assertPlaying, currentPlayer, advanceTurn, declareWinner, declareDraw, assertTurn, assertInRange } from './shared.js';

export function createInitialState(game, players, seed) {
  const { size } = game.options;
  return {
    engine: 'line',
    board: Array(size * size).fill(''),
    turnIndex: 0,
    moveCount: 0,
    status: 'playing',
    winner: '',
    lastMove: -1,
    winLine: [],
    seed,
  };
}

export function applyAction(game, state, uid, action, players) {
  assertPlaying(state);
  const { size, connect } = game.options;
  const current = currentPlayer(state, players);
  assertTurn(uid, current);
  const { index } = action;
  assertInRange(index, 0, size * size);
  if (state.board[index] !== '') throw new Error('That cell is already taken.');

  state.board[index] = uid;
  state.lastMove = index;
  state.moveCount++;

  // Check for a winner
  const win = findWinLine(state.board, size, connect, uid);
  if (win.length >= connect) {
    state.winLine = win;
    declareWinner(state, uid);
    return state;
  }

  // Check for draw
  if (state.moveCount >= size * size) {
    declareDraw(state);
    return state;
  }

  advanceTurn(state, players.length);
  return state;
}

function findWinLine(board, size, connect, uid) {
  const dirs = [1, size, size + 1, size - 1]; // horizontal, vertical, diag-down-right, diag-down-left
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== uid) continue;
    for (const dir of dirs) {
      const line = [i];
      for (let step = 1; step < connect; step++) {
        const next = i + dir * step;
        // Prevent horizontal wrap: if dir is 1, check same row
        if (dir === 1 && Math.floor(next / size) !== Math.floor((i + step * dir - dir) / size)) break;
        if (next < 0 || next >= board.length || board[next] !== uid) break;
        line.push(next);
      }
      if (line.length >= connect) return line;
    }
  }
  return [];
}