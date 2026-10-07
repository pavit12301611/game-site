// Dots & Boxes — claim edges, steal boxes. Greedy now, sorry later.
import { h } from '../core/dom.js';
import { createTable } from './table.js';

export const N = 4; // 4x4 boxes, 5x5 dots
const NS = 'http://www.w3.org/2000/svg';

export function newEdges() {
  return {
    h: Array.from({ length: N + 1 }, () => Array(N).fill(-1)),
    v: Array.from({ length: N }, () => Array(N + 1).fill(-1)),
  };
}

export function newState() {
  return {
    ...newEdges(),
    boxes: Array.from({ length: N }, () => Array(N).fill(-1)),
    scores: [0, 0],
    claimed: 0,
    turn: 0,
  };
}

/** How many sides does box (r,c) have? */
export function sidesOf(s, r, c) {
  return (
    (s.h[r][c] !== -1 ? 1 : 0) +
    (s.h[r + 1][c] !== -1 ? 1 : 0) +
    (s.v[r][c] !== -1 ? 1 : 0) +
    (s.v[r][c + 1] !== -1 ? 1 : 0)
  );
}

export function freeEdges(s) {
  const out = [];
  for (let r = 0; r <= N; r++) for (let c = 0; c < N; c++) if (s.h[r][c] === -1) out.push({ o: 'h', r, c });
  for (let r = 0; r < N; r++) for (let c = 0; c <= N; c++) if (s.v[r][c] === -1) out.push({ o: 'v', r, c });
  return out;
}

function adjacentBoxes(m) {
  if (m.o === 'h') {
    const out = [];
    if (m.r > 0) out.push([m.r - 1, m.c]);
    if (m.r < N) out.push([m.r, m.c]);
    return out;
  }
  const out = [];
  if (m.c > 0) out.push([m.r, m.c - 1]);
  if (m.c < N) out.push([m.r, m.c]);
  return out;
}

export function applyEdge(s, m) {
  const edges = m.o === 'h' ? s.h : s.v;
  if (edges[m.r][m.c] !== -1) return null;
  const h = s.h.map((row) => row.slice());
  const v = s.v.map((row) => row.slice());
  (m.o === 'h' ? h : v)[m.r][m.c] = s.turn;
  const boxes = s.boxes.map((row) => row.slice());
  const scores = s.scores.slice();
  let claimed = s.claimed;
  let took = 0;
  const probe = { h, v };
  for (const [br, bc] of adjacentBoxes(m)) {
    if (boxes[br][bc] === -1 && sidesOf(probe, br, bc) === 4) {
      boxes[br][bc] = s.turn;
      scores[s.turn] += 1;
      claimed += 1;
      took += 1;
    }
  }
  return {
    h, v, boxes, scores, claimed,
    turn: took > 0 ? s.turn : s.turn ^ 1,
    took,
  };
}

function dangerOf(s, m) {
  // Boxes this move would push to 3 sides (gifts for the opponent).
  let danger = 0;
  for (const [br, bc] of adjacentBoxes(m)) {
    if (s.boxes[br][bc] === -1 && sidesOf(s, br, bc) === 2) danger += 1;
  }
  return danger;
}

export function cpuPick(s, difficulty) {
  const free = freeEdges(s);
  if (free.length === 0) return null;
  if (difficulty === 'easy') return free[Math.floor(Math.random() * free.length)];
  const takers = free.filter((m) =>
    adjacentBoxes(m).some(([br, bc]) => s.boxes[br][bc] === -1 && sidesOf(s, br, bc) === 3),
  );
  if (takers.length > 0) return takers[Math.floor(Math.random() * takers.length)];
  if (difficulty === 'medium') return free[Math.floor(Math.random() * free.length)];
  const safe = free.filter((m) => dangerOf(s, m) === 0);
  if (safe.length > 0) return safe[Math.floor(Math.random() * safe.length)];
  free.sort((a, b) => dangerOf(s, a) - dangerOf(s, b));
  return free[0];
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

const PAD = 20;
const GAP = 56;

export default {
  id: 'dotsboxes',
  name: 'Dots & Boxes',
  tagline: 'Draw lines, steal boxes, chain the board.',
  genre: 'Strategy',
  players: 'both',
  icon: '🔲',
  hue: 160,
  modes: [
    { id: 'cpu', label: 'Vs CPU' },
    { id: 'local', label: '2 Players' },
  ],
  difficulties: [
    { id: 'easy', label: 'Chill' },
    { id: 'medium', label: 'Sharp' },
    { id: 'hard', label: 'Cutthroat' },
  ],
  howTo: [
    'Click between two dots to draw a line.',
    'Complete the 4th side of a box to claim it — and move again.',
    'Most boxes when the board fills wins. Chains decide everything.',
  ],
  mount(root, ctx) {
    const players = ctx.mode === 'cpu' ? [ctx.names[0], 'CPU'] : ctx.names;
    const table = createTable(root, {
      gameId: 'dotsboxes',
      mode: ctx.mode,
      players,
      difficulty: ctx.difficulty,
      setup: () => newState(),
      statusOf: (s) =>
        ({ text: `${players[0]} ${s.scores[0]} · ${s.scores[1]} ${players[1]} — ${players[s.turn]}'s line`, turn: s.turn }),
      applyMove: (s, m, control) => {
        void control;
        const next = m && typeof m === 'object' ? applyEdge(s, m) : null;
        if (!next) return { state: s, silent: true };
        const { took, ...rest } = next;
        return { state: rest, sound: took > 0 ? 'good' : 'move' };
      },
      resultOf: (s) => {
        if (s.claimed < N * N) return null;
        const [a, b] = s.scores;
        return {
          winner: a === b ? 'draw' : a > b ? 0 : 1,
          label: a === b ? `Dead heat ${a}–${b}!` : `${players[a > b ? 0 : 1]} takes it ${Math.max(a, b)}–${Math.min(a, b)}!`,
          sub: 'Chain reaction complete.',
        };
      },
      cpuMove: (s, d) => cpuPick(s, d),
      renderBoard: (el, s, api) => {
        const size = PAD * 2 + GAP * (N - 1) + GAP;
        const svg = svgEl('svg', {
          viewBox: `0 0 ${size} ${size}`,
          class: 'dots-svg',
          role: 'group',
          'aria-label': 'Dots and boxes board',
        });
        const pt = (i) => PAD + i * GAP;
        // Claimed boxes
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            const owner = s.boxes[r][c];
            if (owner !== -1) {
              svg.append(svgEl('rect', {
                x: pt(c) + 4, y: pt(r) + 4, width: GAP - 8, height: GAP - 8,
                rx: 8, class: `dots-box p${owner}`,
              }));
            }
          }
        }
        const cpuToMove = ctx.mode === 'cpu' && s.turn === 1;
        const locked = api.disabled || cpuToMove;
        const addEdge = (m, x1, y1, x2, y2) => {
          const owner = m.o === 'h' ? s.h[m.r][m.c] : s.v[m.r][m.c];
          if (owner !== -1) {
            svg.append(svgEl('line', {
              x1, y1, x2, y2, class: `dots-edge on p${owner}`,
            }));
            return;
          }
          const g = svgEl('g', {
            class: `dots-spot${locked ? ' locked' : ''}`,
            tabindex: locked ? '-1' : '0',
            role: 'button',
            'aria-label': `Draw line ${m.o} ${m.r},${m.c}`,
          });
          const hit = svgEl('line', { x1, y1, x2, y2, class: 'dots-hit' });
          const ghost = svgEl('line', { x1, y1, x2, y2, class: `dots-ghost p${s.turn}` });
          g.append(hit, ghost);
          if (!locked) {
            g.addEventListener('click', () => api.move(m));
            g.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                api.move(m);
              }
            });
          }
          svg.append(g);
        };
        for (let r = 0; r <= N; r++) {
          for (let c = 0; c < N; c++) addEdge({ o: 'h', r, c }, pt(c), pt(r), pt(c + 1), pt(r));
        }
        for (let r = 0; r < N; r++) {
          for (let c = 0; c <= N; c++) addEdge({ o: 'v', r, c }, pt(c), pt(r), pt(c), pt(r + 1));
        }
        for (let r = 0; r <= N; r++) {
          for (let c = 0; c <= N; c++) {
            svg.append(svgEl('circle', { cx: pt(c), cy: pt(r), r: 5.5, class: 'dots-dot' }));
          }
        }
        el.append(svg);
      },
    });
    return () => table.destroy();
  },
};
