// 2048 — slide, merge, chase the magic tile. Solo zen with a score.
import { h, clear } from '../core/dom.js';
import { sfx } from '../core/sound.js';
import { stats } from '../core/store.js';

export const SIZE = 4;

export function slideRowLeft(row) {
  const tiles = row.filter((v) => v !== 0);
  const out = [];
  let score = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i + 1] === tiles[i]) {
      const merged = tiles[i] * 2;
      out.push(merged);
      score += merged;
      i += 1;
    } else {
      out.push(tiles[i]);
    }
  }
  while (out.length < SIZE) out.push(0);
  return { row: out, score };
}

function rotateCW(g) {
  return g[0].map((_, c) => g.map((row) => row[row.length - 1 - c]));
}

function rotateCCW(g) {
  return g[0].map((_, c) => g.map((row) => row[c]).reverse());
}

function flipH(g) {
  return g.map((row) => row.slice().reverse());
}

/** dir: 'left' | 'right' | 'up' | 'down' */
export function moveDir(grid, dir) {
  let work = grid.map((row) => row.slice());
  if (dir === 'right') work = flipH(work);
  if (dir === 'up') work = rotateCW(work);
  if (dir === 'down') work = rotateCCW(work);
  let score = 0;
  let moved = false;
  const slid = work.map((row) => {
    const r = slideRowLeft(row);
    score += r.score;
    if (r.row.some((v, i) => v !== row[i])) moved = true;
    return r.row;
  });
  let out = slid;
  if (dir === 'right') out = flipH(slid);
  if (dir === 'up') out = rotateCCW(slid);
  if (dir === 'down') out = rotateCW(slid);
  return { grid: out, score, moved };
}

export function hasMoves(grid) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === 0) return true;
      if (c + 1 < SIZE && grid[r][c] === grid[r][c + 1]) return true;
      if (r + 1 < SIZE && grid[r][c] === grid[r + 1][c]) return true;
    }
  }
  return false;
}

export function spawnTile(grid, rng = Math.random) {
  const empty = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) if (grid[r][c] === 0) empty.push([r, c]);
  }
  if (empty.length === 0) return null;
  const [r, c] = empty[Math.floor(rng() * empty.length)];
  grid[r][c] = rng() < 0.9 ? 2 : 4;
  return { r, c };
}

export default {
  id: 'g2048',
  name: '2048',
  tagline: 'Slide tiles. Merge up. Reach 2048.',
  genre: 'Puzzle',
  players: 'solo',
  icon: '🔢',
  hue: 35,
  modes: [{ id: 'solo', label: 'Solo run' }],
  difficulties: null,
  howTo: [
    'Arrow keys, WASD, or swipe to slide every tile.',
    'Matching tiles merge and add to your score.',
    'Reach 2048 to win — then keep climbing if you dare.',
  ],
  mount(root, ctx) {
    void ctx;
    let grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    let score = 0;
    let best = stats.get('g2048').best;
    let over = false;
    let celebrated = false;
    let fresh = null;

    const hud = h('div', { class: 'tz-hud' });
    const scorePill = h('div', { class: 'pill', text: 'Score 0' });
    const bestPill = h('div', { class: 'pill', text: `Best ${best}` });
    hud.append(scorePill, bestPill, h('button', { class: 'btn btn-ghost btn-sm', onclick: () => restart() }, '↻ New game'));

    const board = h('div', { class: 'tz-board', role: 'grid', 'aria-label': '2048 board' });
    const msg = h('div', { class: 'tz-msg', role: 'status', 'aria-live': 'polite' });
    root.append(hud, board, msg);

    spawnTile(grid);
    spawnTile(grid);

    function tileClass(v) {
      if (v === 0) return 'tz-cell empty';
      const power = Math.round(Math.log2(v));
      return `tz-cell t${Math.min(power, 12)}`;
    }

    function paint() {
      clear(board);
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const v = grid[r][c];
          const isFresh = fresh && fresh.r === r && fresh.c === c;
          board.append(
            h('div', {
              class: `${tileClass(v)}${isFresh ? ' fresh' : ''}`,
              text: v === 0 ? '' : String(v),
            }),
          );
        }
      }
      scorePill.textContent = `Score ${score}`;
      bestPill.textContent = `Best ${Math.max(best, score)}`;
    }

    function slide(dir) {
      if (over) return;
      const out = moveDir(grid, dir);
      if (!out.moved) {
        sfx.play('error');
        return;
      }
      grid = out.grid;
      score += out.score;
      fresh = spawnTile(grid);
      sfx.play(out.score >= 64 ? 'good' : 'move');
      if (!celebrated && grid.some((row) => row.some((v) => v >= 2048))) {
        celebrated = true;
        sfx.play('win');
        msg.innerHTML = '';
        msg.append(h('strong', { text: '🎉 You made 2048! Keep going…' }));
      }
      if (!hasMoves(grid)) return gameOver();
      paint();
    }

    function gameOver() {
      over = true;
      paint();
      sfx.play('lose');
      stats.record('g2048', { winner: null, score });
      clear(msg);
      msg.append(
        h('div', { class: 'result-card inline', role: 'dialog', 'aria-label': 'Game over' },
          h('div', { class: 'result-emoji', text: celebrated ? '🏆' : '🧱' }),
          h('h2', { text: celebrated ? `Finished with ${score}` : 'No moves left' }),
          h('p', { class: 'muted', text: celebrated ? 'Legendary run.' : 'So close — run it back.' }),
          h('div', { class: 'result-actions' },
            h('button', { class: 'btn btn-primary', onclick: () => restart() }, 'New game'))),
      );
      msg.querySelector('button')?.focus({ preventScroll: true });
    }

    function restart() {
      grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
      score = 0;
      best = stats.get('g2048').best;
      over = false;
      celebrated = false;
      fresh = null;
      spawnTile(grid);
      spawnTile(grid);
      clear(msg);
      sfx.play('click');
      paint();
    }

    const KEYMAP = {
      ArrowLeft: 'left', a: 'left', A: 'left',
      ArrowRight: 'right', d: 'right', D: 'right',
      ArrowUp: 'up', w: 'up', W: 'up',
      ArrowDown: 'down', s: 'down', S: 'down',
    };
    const onKey = (e) => {
      const dir = KEYMAP[e.key];
      if (!dir) return;
      e.preventDefault();
      slide(dir);
    };
    let touchStart = null;
    const onTouchStart = (e) => {
      touchStart = [e.touches[0].clientX, e.touches[0].clientY];
    };
    const onTouchEnd = (e) => {
      if (!touchStart) return;
      const dx = e.changedTouches[0].clientX - touchStart[0];
      const dy = e.changedTouches[0].clientY - touchStart[1];
      touchStart = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      slide(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    };

    document.addEventListener('keydown', onKey);
    board.addEventListener('touchstart', onTouchStart, { passive: true });
    board.addEventListener('touchend', onTouchEnd, { passive: true });

    paint();
    return () => {
      document.removeEventListener('keydown', onKey);
      board.removeEventListener('touchstart', onTouchStart);
      board.removeEventListener('touchend', onTouchEnd);
    };
  },
};
