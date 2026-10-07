// Connect Four — drop discs, connect four. Hard mode thinks 4 moves deep.
import { h } from '../core/dom.js';
import { createTable } from './table.js';

export const ROWS = 6;
export const COLS = 7;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const CENTER_ORDER = [3, 2, 4, 1, 5, 0, 6];

export function newGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
}

export function legalCols(grid) {
  const out = [];
  for (let c = 0; c < COLS; c++) if (grid[0][c] === -1) out.push(c);
  return out;
}

export function dropRow(grid, col) {
  for (let r = ROWS - 1; r >= 0; r--) if (grid[r][col] === -1) return r;
  return -1;
}

export function winnerOf(grid) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = grid[r][c];
      if (v === -1) continue;
      for (const [dr, dc] of DIRS) {
        const line = [[r, c]];
        for (let k = 1; k < 4; k++) {
          const nr = r + dr * k;
          const nc = c + dc * k;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || grid[nr][nc] !== v) break;
          line.push([nr, nc]);
        }
        if (line.length === 4) return { winner: v, line };
      }
    }
  }
  if (legalCols(grid).length === 0) return { winner: 'draw', line: [] };
  return { winner: null, line: [] };
}

function tryWin(grid, col, seat) {
  const r = dropRow(grid, col);
  if (r < 0) return false;
  grid[r][col] = seat;
  const wins = winnerOf(grid).winner === seat;
  grid[r][col] = -1;
  return wins;
}

function windows(grid) {
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) out.push([grid[r][c], grid[r][c + 1], grid[r][c + 2], grid[r][c + 3]]);
  }
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c < COLS; c++) out.push([grid[r][c], grid[r + 1][c], grid[r + 2][c], grid[r + 3][c]]);
  }
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      out.push([grid[r][c], grid[r + 1][c + 1], grid[r + 2][c + 2], grid[r + 3][c + 3]]);
    }
  }
  for (let r = 3; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      out.push([grid[r][c], grid[r - 1][c + 1], grid[r - 2][c + 2], grid[r - 3][c + 3]]);
    }
  }
  return out;
}

function scoreWindow(w, ai) {
  const opp = ai ^ 1;
  const a = w.filter((v) => v === ai).length;
  const o = w.filter((v) => v === opp).length;
  const e = w.filter((v) => v === -1).length;
  if (a === 4) return 100000;
  if (a === 3 && e === 1) return 60;
  if (a === 2 && e === 2) return 12;
  if (o === 3 && e === 1) return -90;
  if (o === 4) return -100000;
  return 0;
}

function evaluate(grid, ai) {
  let score = 0;
  for (let r = 0; r < ROWS; r++) if (grid[r][3] === ai) score += 4;
  for (const w of windows(grid)) score += scoreWindow(w, ai);
  return score;
}

function negamax(grid, depth, alpha, beta, turn, ai) {
  const w = winnerOf(grid).winner;
  if (w === ai) return 1000000 + depth;
  if (w === (ai ^ 1)) return -1000000 - depth;
  if (w === 'draw') return 0;
  if (depth === 0) return evaluate(grid, ai);
  const cols = CENTER_ORDER.filter((c) => grid[0][c] === -1);
  if (turn === ai) {
    let best = -Infinity;
    for (const c of cols) {
      const r = dropRow(grid, c);
      grid[r][c] = turn;
      best = Math.max(best, negamax(grid, depth - 1, alpha, beta, turn ^ 1, ai));
      grid[r][c] = -1;
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const c of cols) {
    const r = dropRow(grid, c);
    grid[r][c] = turn;
    best = Math.min(best, negamax(grid, depth - 1, alpha, beta, turn ^ 1, ai));
    grid[r][c] = -1;
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

export function cpuPick(grid, seat, difficulty) {
  const legal = legalCols(grid);
  if (legal.length === 0) return null;
  if (difficulty === 'easy') return legal[Math.floor(Math.random() * legal.length)];
  for (const c of legal) if (tryWin(grid, c, seat)) return c;
  for (const c of legal) if (tryWin(grid, c, seat ^ 1)) return c;
  const preferred = CENTER_ORDER.filter((c) => legal.includes(c));
  if (difficulty === 'medium') {
    return Math.random() < 0.75
      ? preferred[0]
      : legal[Math.floor(Math.random() * legal.length)];
  }
  let best = -Infinity;
  let bestC = preferred[0];
  for (const c of preferred) {
    const r = dropRow(grid, c);
    grid[r][c] = seat;
    const s = negamax(grid, 4, -Infinity, Infinity, seat ^ 1, seat);
    grid[r][c] = -1;
    if (s > best) {
      best = s;
      bestC = c;
    }
  }
  return bestC;
}

export default {
  id: 'connect4',
  name: 'Connect Four',
  tagline: 'Drop discs. Build the line of four.',
  genre: 'Strategy',
  players: 'both',
  icon: '🔴',
  hue: 350,
  modes: [
    { id: 'cpu', label: 'Vs CPU' },
    { id: 'local', label: '2 Players' },
  ],
  difficulties: [
    { id: 'easy', label: 'Chill' },
    { id: 'medium', label: 'Sharp' },
    { id: 'hard', label: 'Ruthless' },
  ],
  howTo: [
    'Pick a column to drop your disc — it falls to the lowest free slot.',
    'Connect four of your discs horizontally, vertically, or diagonally.',
    'Block your rival: one open end is all it takes to lose.',
  ],
  mount(root, ctx) {
    const players = ctx.mode === 'cpu' ? [ctx.names[0], 'CPU'] : ctx.names;
    const table = createTable(root, {
      gameId: 'connect4',
      mode: ctx.mode,
      players,
      difficulty: ctx.difficulty,
      thinkingMs: 650,
      setup: () => ({ grid: newGrid(), turn: 0, last: null }),
      statusOf: (s) => ({ text: `${players[s.turn]} to drop`, turn: s.turn }),
      applyMove: (s, col) => {
        const r = typeof col === 'number' ? dropRow(s.grid, col) : -1;
        if (r < 0) return { state: s, silent: true };
        const grid = s.grid.map((row) => row.slice());
        grid[r][col] = s.turn;
        const decided = winnerOf(grid).winner !== null;
        return {
          state: { grid, turn: s.turn ^ 1, last: { r, c: col } },
          sound: decided ? 'good' : 'move',
        };
      },
      resultOf: (s) => {
        const w = winnerOf(s.grid);
        if (w.winner === null) return null;
        return {
          winner: w.winner,
          label: w.winner === 'draw' ? 'Board full — draw!' : `${players[w.winner]} connects four!`,
          line: w.line,
        };
      },
      cpuMove: (s, d) => cpuPick(s.grid, s.turn, d),
      renderBoard: (el, s, api) => {
        const winKeys = new Set((s._result?.line || []).map(([r, c]) => `${r},${c}`));
        const cpuToMove = ctx.mode === 'cpu' && s.turn === 1;
        const wrap = h('div', { class: 'c4-wrap' });
        const dropRowEl = h('div', { class: 'c4-drops', role: 'group', 'aria-label': 'Choose a column' });
        for (let c = 0; c < COLS; c++) {
          const full = s.grid[0][c] !== -1;
          dropRowEl.append(
            h('button', {
              class: `c4-drop p${s.turn}`,
              text: '▼',
              disabled: full || api.disabled || cpuToMove,
              'aria-label': `Drop in column ${c + 1}`,
              onclick: () => api.move(c),
            }),
          );
        }
        const grid = h('div', { class: 'c4-grid', 'aria-hidden': 'true' });
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const v = s.grid[r][c];
            const isLast = s.last && s.last.r === r && s.last.c === c;
            grid.append(
              h('div', { class: 'c4-cell' },
                h('div', {
                  class: `c4-disc p${v}${isLast ? ' last' : ''}${winKeys.has(`${r},${c}`) ? ' win' : ''}`,
                }),
              ),
            );
          }
        }
        wrap.append(dropRowEl, grid);
        el.append(wrap);
      },
    });
    return () => table.destroy();
  },
};
