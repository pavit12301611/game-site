/**
 * Drop engine: connect four, five in a row (gravity drop boards).
 *
 * Options: { cols: number, rows: number, connect: number }
 * Board is cols×rows flat array, column-major (col 0 is indices 0..rows-1).
 */

import { copy, assertPlaying, currentPlayer, advanceTurn, declareWinner, declareDraw, assertTurn, assertInRange } from './shared.js';

export function createInitialState(game, players, seed) {
  const { cols, rows } = game.options;
  return {
    engine: 'drop',
    board: Array(cols * rows).fill(''),
    turnIndex: 0,
    moveCount: 0,
    status: 'playing',
    winner: '',
    lastMove: -1,
    winLine: [],
    colHeights: Array(cols).fill(0),
    seed,
  };
}

export function applyAction(game, state, uid, action, players) {
  assertPlaying(state);
  const { cols, rows, connect } = game.options;
  const current = currentPlayer(state, players);
  assertTurn(uid, current);
  const { col } = action;
  assertInRange(col, 0, cols);
  if (state.colHeights[col] >= rows) throw new Error('That column is full.');

  const cellIndex = col * rows + state.colHeights[col];
  state.board[cellIndex] = uid;
  state.colHeights[col]++;
  state.lastMove = cellIndex;
  state.moveCount++;

  const win = findDropWinLine(state.board, cols, rows, connect, cellIndex, uid);
  if (win.length >= connect) {
    state.winLine = win;
    declareWinner(state, uid);
    return state;
  }

  if (state.moveCount >= cols * rows) {
    declareDraw(state);
    return state;
  }

  advanceTurn(state, players.length);
  return state;
}

function findDropWinLine(board, cols, rows, connect, cell, uid) {
  // Check all 4 directions from the placed cell
  const col = Math.floor(cell / rows);
  const row = cell % rows;
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]]; // vert, horiz, diag1, diag2
  for (const [dc, dr] of dirs) {
    const line = [cell];
    for (const sign of [1, -1]) {
      for (let step = 1; step < connect; step++) {
        const nc = col + dc * step * sign;
        const nr = row + dr * step * sign;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) break;
        const idx = nc * rows + nr;
        if (board[idx] !== uid) break;
        line.push(idx);
      }
    }
    if (line.length >= connect) return line;
  }
  return [];
}