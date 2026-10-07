// Tic-Tac-Toe — the timeless warm-up. Hard mode is a perfect minimax: undrawable only.
import { h } from '../core/dom.js';
import { createTable } from './table.js';

export const MARKS = ['✕', '○'];
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function winnerOf(cells) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (cells[a] !== -1 && cells[a] === cells[b] && cells[a] === cells[c]) {
      return { winner: cells[a], line };
    }
  }
  if (cells.every((v) => v !== -1)) return { winner: 'draw', line: [] };
  return { winner: null, line: [] };
}

const empties = (cells) => cells.map((v, i) => (v === -1 ? i : -1)).filter((i) => i >= 0);
const randomOf = (arr) => arr[Math.floor(Math.random() * arr.length)];

function findWinning(cells, seat) {
  for (const i of empties(cells)) {
    cells[i] = seat;
    const wins = winnerOf(cells).winner === seat;
    cells[i] = -1;
    if (wins) return i;
  }
  return -1;
}

function minimax(cells, seat, ai) {
  const w = winnerOf(cells).winner;
  if (w === ai) return 10;
  if (w === 'draw') return 0;
  if (w !== null) return -10;
  let best = seat === ai ? -Infinity : Infinity;
  for (const i of empties(cells)) {
    cells[i] = seat;
    const s = minimax(cells, seat ^ 1, ai);
    cells[i] = -1;
    best = seat === ai ? Math.max(best, s) : Math.min(best, s);
  }
  return best;
}

export function cpuPick(cells, seat, difficulty) {
  const moves = empties(cells);
  if (moves.length === 0) return null;
  if (difficulty === 'easy') return randomOf(moves);
  const win = findWinning(cells, seat);
  if (win >= 0) return win;
  const block = findWinning(cells, seat ^ 1);
  if (block >= 0) return block;
  if (difficulty === 'medium') {
    if (cells[4] === -1 && Math.random() < 0.7) return 4;
    const corners = [0, 2, 6, 8].filter((i) => cells[i] === -1);
    if (corners.length > 0 && Math.random() < 0.6) return randomOf(corners);
    return randomOf(moves);
  }
  let best = -Infinity;
  let bestI = moves[0];
  for (const i of moves) {
    cells[i] = seat;
    const s = minimax(cells, seat ^ 1, seat);
    cells[i] = -1;
    if (s > best) {
      best = s;
      bestI = i;
    }
  }
  return bestI;
}

export default {
  id: 'tictactoe',
  name: 'Tic-Tac-Toe',
  tagline: 'Three in a row. Deceptively deep.',
  genre: 'Strategy',
  players: 'both',
  icon: '❌',
  hue: 210,
  modes: [
    { id: 'cpu', label: 'Vs CPU' },
    { id: 'local', label: '2 Players' },
  ],
  difficulties: [
    { id: 'easy', label: 'Chill' },
    { id: 'medium', label: 'Sharp' },
    { id: 'hard', label: 'Unbeatable' },
  ],
  howTo: [
    'Get three of your marks in a row — across, down, or diagonal.',
    '✕ always moves first.',
    'On Hard the CPU plays perfectly: a draw is a victory.',
  ],
  mount(root, ctx) {
    const players = ctx.mode === 'cpu' ? [ctx.names[0], 'CPU'] : ctx.names;
    const table = createTable(root, {
      gameId: 'tictactoe',
      mode: ctx.mode,
      players,
      difficulty: ctx.difficulty,
      setup: () => ({ cells: Array(9).fill(-1), turn: 0 }),
      statusOf: (s) => ({ text: `${players[s.turn]}'s turn ${MARKS[s.turn]}`, turn: s.turn }),
      applyMove: (s, m) => {
        if (typeof m !== 'number' || s.cells[m] !== -1) return { state: s, silent: true };
        const cells = s.cells.slice();
        cells[m] = s.turn;
        const decided = winnerOf(cells).winner !== null;
        return { state: { cells, turn: s.turn ^ 1 }, sound: decided ? 'good' : 'move' };
      },
      resultOf: (s) => {
        const w = winnerOf(s.cells);
        if (w.winner === null) return null;
        return {
          winner: w.winner,
          label: w.winner === 'draw' ? "It's a draw" : `${players[w.winner]} takes it!`,
          line: w.line,
        };
      },
      cpuMove: (s, d) => cpuPick(s.cells, s.turn, d),
      renderBoard: (el, s, api) => {
        const line = s._result?.line || [];
        const cpuToMove = ctx.mode === 'cpu' && s.turn === 1;
        const grid = h('div', { class: 'ttt-grid', role: 'grid', 'aria-label': 'Tic-tac-toe board' });
        s.cells.forEach((v, i) => {
          grid.append(
            h('button', {
              class: `ttt-cell p${v}${line.includes(i) ? ' win' : ''}${api.lastMove === i ? ' last' : ''}`,
              text: v === -1 ? '' : MARKS[v],
              disabled: v !== -1 || api.disabled || cpuToMove,
              'aria-label': `Cell ${i + 1}${v === -1 ? ', empty' : `, ${MARKS[v]}`}`,
              onclick: () => api.move(i),
            }),
          );
        });
        el.append(grid);
      },
    });
    return () => table.destroy();
  },
};
