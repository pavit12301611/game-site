// Minesweeper — the classic minefield. First click is always safe.
import { h, clear, fmtTime } from '../core/dom.js';
import { sfx } from '../core/sound.js';
import { stats } from '../core/store.js';

export const LEVELS = {
  easy: { cols: 9, rows: 9, mines: 10, label: '9×9 · 10' },
  medium: { cols: 12, rows: 12, mines: 26, label: '12×12 · 26' },
  hard: { cols: 16, rows: 16, mines: 48, label: '16×16 · 48' },
};

const idx = (cols, r, c) => r * cols + c;

export function neighbors(cols, rows, i) {
  const r = Math.floor(i / cols);
  const c = i % cols;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(idx(cols, nr, nc));
    }
  }
  return out;
}

/** Random mine positions, keeping the 3×3 around `safe` clear. */
export function placeMines(cols, rows, count, safe, rng = Math.random) {
  const total = cols * rows;
  const banned = new Set([safe, ...neighbors(cols, rows, safe)]);
  const pool = [];
  for (let i = 0; i < total; i++) if (!banned.has(i)) pool.push(i);
  const mines = new Set();
  while (mines.size < count && pool.length > 0) {
    const k = Math.floor(rng() * pool.length);
    mines.add(pool.splice(k, 1)[0]);
  }
  return mines;
}

/** -1 for a mine, else the adjacent mine count. */
export function countsFor(cols, rows, mines) {
  const total = cols * rows;
  const counts = new Array(total).fill(0);
  for (const m of mines) {
    counts[m] = -1;
    for (const n of neighbors(cols, rows, m)) {
      if (counts[n] !== -1) counts[n] += 1;
    }
  }
  return counts;
}

export default {
  id: 'minesweeper',
  name: 'Minesweeper',
  tagline: 'Clear the field. Trust the numbers.',
  genre: 'Puzzle',
  players: 'solo',
  icon: '💣',
  hue: 45,
  modes: [{ id: 'solo', label: 'Solo run' }],
  difficulties: [
    { id: 'easy', label: 'Rookie 9×9' },
    { id: 'medium', label: 'Scout 12×12' },
    { id: 'hard', label: 'Expert 16×16' },
  ],
  howTo: [
    'Click a tile to reveal it. Numbers count adjacent mines.',
    'Right-click (or long-press) to flag a suspected mine.',
    'Your first click is always safe. Clear every safe tile to win.',
  ],
  mount(root, ctx) {
    const level = LEVELS[ctx.difficulty] || LEVELS.medium;
    const { cols, rows, mines: mineCount } = level;
    const total = cols * rows;
    let mines = new Set();
    let counts = new Array(total).fill(0);
    let revealed = new Array(total).fill(false);
    let flagged = new Array(total).fill(false);
    let started = false;
    let over = false;
    let won = false;
    let revealedCount = 0;
    let seconds = 0;
    let timer = null;
    let dead = true;

    const hud = h('div', { class: 'ms-hud' });
    const minePill = h('div', { class: 'pill', text: `💣 ${mineCount}` });
    const timePill = h('div', { class: 'pill', text: '⏱ 0:00' });
    const faceBtn = h('button', { class: 'btn btn-ghost btn-sm', 'aria-label': 'Restart', onclick: () => restart() }, '🙂');
    hud.append(minePill, faceBtn, timePill);

    const grid = h('div', { class: 'ms-grid', role: 'grid', 'aria-label': 'Minefield' });
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.maxWidth = `${cols * 34}px`;

    const overlayWrap = h('div', { class: 'ms-overlay-wrap' });
    root.append(hud, grid, overlayWrap);

    function startTimer() {
      stopTimer();
      timer = setInterval(() => {
        seconds += 1;
        timePill.textContent = `⏱ ${fmtTime(seconds)}`;
      }, 1000);
    }
    function stopTimer() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    function updateHud() {
      const flags = flagged.filter(Boolean).length;
      minePill.textContent = `💣 ${mineCount - flags}`;
      faceBtn.textContent = over ? (won ? '😎' : '😵') : '🙂';
    }

    function flood(start) {
      const stack = [start];
      while (stack.length > 0) {
        const i = stack.pop();
        if (revealed[i] || flagged[i]) continue;
        revealed[i] = true;
        revealedCount += 1;
        if (counts[i] === 0) {
          for (const n of neighbors(cols, rows, i)) {
            if (!revealed[n] && !flagged[n]) stack.push(n);
          }
        }
      }
    }

    function reveal(i) {
      if (over || revealed[i] || flagged[i]) return;
      if (!started) {
        started = true;
        mines = placeMines(cols, rows, mineCount, i);
        counts = countsFor(cols, rows, mines);
        startTimer();
      }
      if (mines.has(i)) {
        revealed[i] = true;
        return lose();
      }
      flood(i);
      sfx.play('click');
      if (revealedCount === total - mineCount) return win();
      paint();
      updateHud();
    }

    function toggleFlag(i) {
      if (over || revealed[i] || !started && false) return;
      flagged[i] = !flagged[i];
      sfx.play('pop');
      paint();
      updateHud();
    }

    function win() {
      over = true;
      won = true;
      stopTimer();
      for (const m of mines) flagged[m] = true;
      sfx.play('win');
      stats.record('minesweeper', { winner: null, score: Math.max(1, 3600 - seconds) });
      paint();
      updateHud();
      showOverlay('🏆', 'Field cleared!', `Time ${fmtTime(seconds)} on ${level.label}.`);
    }

    function lose() {
      over = true;
      won = false;
      stopTimer();
      sfx.play('lose');
      stats.record('minesweeper', { winner: null });
      paint();
      updateHud();
      showOverlay('💥', 'Boom!', 'That tile was loaded. Try a new field.');
    }

    function showOverlay(emoji, title, sub) {
      clear(overlayWrap);
      overlayWrap.append(
        h('div', { class: 'result-card inline', role: 'dialog', 'aria-label': title },
          h('div', { class: 'result-emoji', text: emoji }),
          h('h2', { text: title }),
          h('p', { class: 'muted', text: sub }),
          h('div', { class: 'result-actions' },
            h('button', { class: 'btn btn-primary', onclick: () => restart() }, 'Play again')),
        ),
      );
      overlayWrap.querySelector('button')?.focus({ preventScroll: true });
    }

    function paint() {
      clear(grid);
      for (let i = 0; i < total; i++) {
        const isMine = mines.has(i);
        const showMine = over && isMine;
        const wrongFlag = over && !won && flagged[i] && !isMine;
        let text = '';
        let cls = 'ms-cell';
        if (revealed[i] && isMine) {
          text = '💥';
          cls += ' blown';
        } else if (revealed[i]) {
          cls += ' open';
          if (counts[i] > 0) {
            text = String(counts[i]);
            cls += ` n${counts[i]}`;
          }
        } else if (wrongFlag) {
          text = '❌';
        } else if (flagged[i]) {
          text = '🚩';
        } else if (showMine) {
          text = '💣';
          cls += ' exposed';
        }
        const btn = h('button', {
          class: cls,
          text,
          'aria-label': revealed[i] ? `Revealed ${counts[i] < 0 ? 'mine' : counts[i]}` : `Hidden tile ${i + 1}`,
        });
        btn.addEventListener('click', () => {
          if (btn.dataset.suppress === '1') {
            btn.dataset.suppress = '';
            return;
          }
          reveal(i);
        });
        btn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          toggleFlag(i);
        });
        let pressTimer = null;
        btn.addEventListener('pointerdown', () => {
          clearTimeout(pressTimer);
          pressTimer = setTimeout(() => {
            btn.dataset.suppress = '1';
            toggleFlag(i);
          }, 420);
        });
        btn.addEventListener('pointerup', () => clearTimeout(pressTimer));
        btn.addEventListener('pointerleave', () => clearTimeout(pressTimer));
        grid.append(btn);
      }
    }

    function restart() {
      mines = new Set();
      counts = new Array(total).fill(0);
      revealed = new Array(total).fill(false);
      flagged = new Array(total).fill(false);
      started = false;
      over = false;
      won = false;
      revealedCount = 0;
      seconds = 0;
      timePill.textContent = '⏱ 0:00';
      stopTimer();
      clear(overlayWrap);
      sfx.play('click');
      paint();
      updateHud();
    }

    dead = false;
    void dead;
    paint();
    updateHud();

    return () => stopTimer();
  },
};
