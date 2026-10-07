// Snake — eat, grow, don't bite yourself. The phone-booth legend returns.
import { h, clear } from '../core/dom.js';
import { sfx } from '../core/sound.js';
import { stats } from '../core/store.js';

export const CELLS = 20;
export const SPEEDS = { easy: 150, medium: 115, hard: 88 };

export function nextHead(head, dir) {
  return { x: head.x + dir.x, y: head.y + dir.y };
}

export function outOfBounds(p, size = CELLS) {
  return p.x < 0 || p.y < 0 || p.x >= size || p.y >= size;
}

export function hitsSelf(body, head) {
  return body.some((s) => s.x === head.x && s.y === head.y);
}

function freeSpot(body, rng = Math.random) {
  const taken = new Set(body.map((s) => `${s.x},${s.y}`));
  const free = [];
  for (let x = 0; x < CELLS; x++) {
    for (let y = 0; y < CELLS; y++) if (!taken.has(`${x},${y}`)) free.push({ x, y });
  }
  return free.length > 0 ? free[Math.floor(rng() * free.length)] : null;
}

export default {
  id: 'snake',
  name: 'Snake',
  tagline: 'Eat apples. Grow long. Survive.',
  genre: 'Arcade',
  players: 'solo',
  icon: '🐍',
  hue: 120,
  modes: [{ id: 'solo', label: 'Solo run' }],
  difficulties: [
    { id: 'easy', label: 'Garden' },
    { id: 'medium', label: 'Jungle' },
    { id: 'hard', label: 'Viper pit' },
  ],
  howTo: [
    'Steer with arrows, WASD, swipe, or the on-screen pad.',
    'Apples grow you by one. Walls and your own tail end the run.',
    'Pause any time — Snake waits for no one, except you.',
  ],
  mount(root, ctx) {
    const stepMs = SPEEDS[ctx.difficulty] || SPEEDS.medium;
    let body = [];
    let dir = { x: 1, y: 0 };
    let queued = [];
    let food = null;
    let score = 0;
    let best = stats.get('snake').best;
    let running = false;
    let paused = false;
    let over = false;
    let raf = null;
    let last = 0;
    let acc = 0;
    let recorded = false;

    const hud = h('div', { class: 'arc-hud' });
    const scorePill = h('div', { class: 'pill' });
    const bestPill = h('div', { class: 'pill' });
    const pauseBtn = h('button', { class: 'btn btn-ghost btn-sm', onclick: () => togglePause() }, '⏸ Pause');
    hud.append(scorePill, bestPill, pauseBtn);

    const canvas = h('canvas', {
      class: 'arc-canvas snake',
      width: 420, height: 420,
      role: 'img',
      'aria-label': 'Snake arena',
    });
    const cx = canvas.getContext('2d');
    const scale = 420 / CELLS;

    const pad = h('div', { class: 'dpad', 'aria-label': 'Direction pad' });
    const padBtn = (label, d, aria) =>
      h('button', {
        class: 'dpad-btn', text: label, 'aria-label': aria,
        onclick: () => steer(d),
      });
    pad.append(
      h('span'),
      padBtn('▲', { x: 0, y: -1 }, 'Up'),
      h('span'),
      padBtn('◀', { x: -1, y: 0 }, 'Left'),
      padBtn('▼', { x: 0, y: 1 }, 'Down'),
      padBtn('▶', { x: 1, y: 0 }, 'Right'),
    );

    const panel = h('div', { class: 'arc-panel', 'aria-live': 'polite' });
    root.append(hud, canvas, pad, panel);

    function paintHud() {
      scorePill.textContent = `Score ${score}`;
      bestPill.textContent = `Best ${Math.max(best, score)}`;
      pauseBtn.textContent = paused ? '▶ Resume' : '⏸ Pause';
    }

    function draw() {
      cx.fillStyle = '#0d1120';
      cx.fillRect(0, 0, 420, 420);
      // faint grid
      cx.strokeStyle = 'rgba(148,163,184,0.08)';
      cx.lineWidth = 1;
      for (let i = 1; i < CELLS; i++) {
        cx.beginPath();
        cx.moveTo(i * scale, 0);
        cx.lineTo(i * scale, 420);
        cx.moveTo(0, i * scale);
        cx.lineTo(420, i * scale);
        cx.stroke();
      }
      if (food) {
        cx.font = `${scale * 0.9}px serif`;
        cx.textAlign = 'center';
        cx.textBaseline = 'middle';
        cx.fillText('🍎', (food.x + 0.5) * scale, (food.y + 0.55) * scale);
      }
      body.forEach((s, i) => {
        const t = 1 - i / Math.max(body.length, 1);
        cx.fillStyle = i === 0 ? '#4ade80' : `rgba(74,222,128,${0.45 + t * 0.45})`;
        const padPx = i === 0 ? 1 : 2;
        cx.beginPath();
        cx.roundRect(s.x * scale + padPx, s.y * scale + padPx, scale - padPx * 2, scale - padPx * 2, 5);
        cx.fill();
        if (i === 0) {
          cx.fillStyle = '#0b0e1a';
          const ex = (s.x + 0.5) * scale + dir.x * 3;
          const ey = (s.y + 0.5) * scale + dir.y * 3;
          cx.beginPath();
          cx.arc(ex - 4, ey - (dir.x !== 0 ? 4 : 0), 2.2, 0, 7);
          cx.arc(ex + 4, ey + (dir.x !== 0 ? 4 : 0), 2.2, 0, 7);
          cx.fill();
        }
      });
    }

    function step() {
      if (queued.length > 0) {
        const d = queued.shift();
        if (d.x !== -dir.x || d.y !== -dir.y) dir = d;
      }
      const head = nextHead(body[0], dir);
      const tail = body[body.length - 1];
      const eating = food && head.x === food.x && head.y === food.y;
      const bodyToCheck = eating ? body : body.slice(0, -1);
      void tail;
      if (outOfBounds(head) || hitsSelf(bodyToCheck, head)) return gameOver();
      body.unshift(head);
      if (eating) {
        score += 10;
        sfx.play('pop');
        food = freeSpot(body);
        if (!food) return gameOver(true);
      } else {
        body.pop();
      }
      paintHud();
      draw();
    }

    function loop(t) {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (paused || over) return;
      if (!last) last = t;
      acc += t - last;
      last = t;
      while (acc >= stepMs && !over) {
        acc -= stepMs;
        step();
      }
    }

    function steer(d) {
      if (!running || paused || over) return;
      const lastQ = queued.length > 0 ? queued[queued.length - 1] : dir;
      if ((d.x !== -lastQ.x || d.y !== -lastQ.y) && (d.x !== lastQ.x || d.y !== lastQ.y)) {
        if (queued.length < 3) queued.push(d);
      }
    }

    function togglePause(force) {
      if (!running || over) return;
      paused = force !== undefined ? force : !paused;
      last = 0;
      acc = 0;
      sfx.play('click');
      paintHud();
      clear(panel);
      if (paused) panel.append(h('p', { class: 'muted', text: 'Paused — catch your breath.' }));
    }

    function gameOver(filled = false) {
      over = true;
      running = false;
      cancelAnimationFrame(raf);
      sfx.play('lose');
      if (!recorded) {
        recorded = true;
        stats.record('snake', { winner: null, score });
      }
      clear(panel);
      panel.append(
        h('div', { class: 'result-card inline', role: 'dialog', 'aria-label': 'Run over' },
          h('div', { class: 'result-emoji', text: filled ? '👑' : '🐍' }),
          h('h2', { text: filled ? `Board cleared! ${score}` : `Wrecked at ${score}` }),
          h('p', { class: 'muted', text: `Best: ${stats.get('snake').best}` }),
          h('div', { class: 'result-actions' },
            h('button', { class: 'btn btn-primary', onclick: () => start() }, 'Slither again'))),
      );
      panel.querySelector('button')?.focus({ preventScroll: true });
    }

    function start() {
      cancelAnimationFrame(raf);
      body = [{ x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }];
      dir = { x: 1, y: 0 };
      queued = [];
      food = freeSpot(body);
      score = 0;
      best = stats.get('snake').best;
      over = false;
      paused = false;
      running = true;
      recorded = false;
      last = 0;
      acc = 0;
      clear(panel);
      sfx.play('click');
      paintHud();
      draw();
      raf = requestAnimationFrame(loop);
    }

    const KEYMAP = {
      ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 }, W: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 }, S: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 }, A: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 }, D: { x: 1, y: 0 },
    };
    const onKey = (e) => {
      if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        togglePause();
        return;
      }
      const d = KEYMAP[e.key];
      if (!d) return;
      e.preventDefault();
      steer(d);
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
      steer(Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) });
    };
    const onBlur = () => {
      if (running && !over && !paused) togglePause(true);
    };

    document.addEventListener('keydown', onKey);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('blur', onBlur);

    paintHud();
    panel.append(
      h('div', { class: 'result-card inline' },
        h('div', { class: 'result-emoji', text: '🐍' }),
        h('h2', { text: 'Ready to slither?' }),
        h('div', { class: 'result-actions' },
          h('button', { class: 'btn btn-primary', onclick: () => start() }, 'Start'))),
    );
    draw();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('blur', onBlur);
    };
  },
};
