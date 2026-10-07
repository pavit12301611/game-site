// Whack-a-Mole — 30 seconds of pure reflex chaos. Golden moles pay triple.
import { h, clear } from '../core/dom.js';
import { sfx } from '../core/sound.js';
import { stats } from '../core/store.js';

export const LEVELS = {
  easy: { spawnMs: 850, lifeMs: 1150, label: 'Steady' },
  medium: { spawnMs: 650, lifeMs: 900, label: 'Frisky' },
  hard: { spawnMs: 480, lifeMs: 700, label: 'Feral' },
};
export const DURATION_S = 30;

export default {
  id: 'whack',
  name: 'Whack-a-Mole',
  tagline: 'Bonk moles. Chase gold ones.',
  genre: 'Party',
  players: 'both',
  icon: '🔨',
  hue: 25,
  modes: [
    { id: 'solo', label: 'Solo 30s' },
    { id: 'local', label: '2P turns' },
  ],
  difficulties: [
    { id: 'easy', label: 'Steady' },
    { id: 'medium', label: 'Frisky' },
    { id: 'hard', label: 'Feral' },
  ],
  howTo: [
    'Tap moles as they pop. Each bonk scores 1.',
    'Golden moles are rare, fast, and worth 3.',
    '2P: take turns on the same 30 seconds — high score wins.',
  ],
  mount(root, ctx) {
    const level = LEVELS[ctx.difficulty] || LEVELS.medium;
    const duel = ctx.mode === 'local';
    let turn = 0;
    let scores = [0, 0];
    let timeLeft = DURATION_S;
    let playing = false;
    let spawnTimer = null;
    let tickTimer = null;
    let moles = new Array(9).fill(null); // {golden, id} | null
    let moleSeq = 0;
    let destroyed = false;

    const hud = h('div', { class: 'whack-hud' });
    const scorePill = h('div', { class: 'pill' });
    const timePill = h('div', { class: 'pill' });
    const turnPill = h('div', { class: 'pill' });
    hud.append(scorePill, timePill, turnPill);

    const field = h('div', { class: 'whack-field' });
    const holes = [];
    for (let i = 0; i < 9; i++) {
      const hole = h('button', { class: 'whack-hole', 'aria-label': `Hole ${i + 1}` });
      hole.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        bonk(i, hole);
      });
      field.append(hole);
      holes.push(hole);
    }
    const panel = h('div', { class: 'whack-panel', 'aria-live': 'polite' });
    root.append(hud, field, panel);

    function paintHud() {
      scorePill.textContent = duel
        ? `${ctx.names[0]} ${scores[0]} · ${scores[1]} ${ctx.names[1]}`
        : `Score ${scores[0]} · Best ${Math.max(stats.get('whack').best, scores[0])}`;
      timePill.textContent = `⏱ ${Math.ceil(timeLeft)}s`;
      turnPill.textContent = duel ? `${ctx.names[turn]}'s turn` : level.label;
    }

    function paintField() {
      holes.forEach((hole, i) => {
        clear(hole);
        const m = moles[i];
        if (m) {
          hole.append(h('span', {
            class: `whack-mole${m.golden ? ' golden' : ''}${m.bonked ? ' bonked' : ''}`,
            text: m.bonked ? '💥' : m.golden ? '🌟' : '🐹',
          }));
          hole.classList.add('up');
        } else {
          hole.classList.remove('up');
        }
      });
    }

    function spawn() {
      if (!playing || destroyed) return;
      const free = moles.map((m, i) => (m ? -1 : i)).filter((i) => i >= 0);
      if (free.length === 0) return;
      const i = free[Math.floor(Math.random() * free.length)];
      const golden = Math.random() < 0.12;
      const id = ++moleSeq;
      moles[i] = { golden, id, bonked: false };
      paintField();
      setTimeout(() => {
        if (moles[i] && moles[i].id === id) {
          moles[i] = null;
          if (playing) paintField();
        }
      }, golden ? level.lifeMs * 0.7 : level.lifeMs);
    }

    function bonk(i, hole) {
      if (!playing) return;
      const m = moles[i];
      if (!m || m.bonked) return;
      m.bonked = true;
      scores[turn] += m.golden ? 3 : 1;
      sfx.play(m.golden ? 'good' : 'pop');
      hole.classList.add('hit');
      setTimeout(() => hole.classList.remove('hit'), 150);
      paintHud();
      paintField();
      setTimeout(() => {
        if (moles[i] && moles[i].id === m.id) {
          moles[i] = null;
          if (playing) paintField();
        }
      }, 180);
    }

    function stopTimers() {
      clearInterval(spawnTimer);
      clearInterval(tickTimer);
      spawnTimer = null;
      tickTimer = null;
    }

    function endTurn() {
      playing = false;
      stopTimers();
      moles = new Array(9).fill(null);
      paintField();
      paintHud();
      clear(panel);
      if (duel && turn === 0) {
        turn = 1;
        paintHud();
        panel.append(
          h('div', { class: 'result-card inline' },
            h('div', { class: 'result-emoji', text: '🔨' }),
            h('h2', { text: `${ctx.names[0]} scored ${scores[0]}` }),
            h('p', { class: 'muted', text: `${ctx.names[1]}, you're up — 30 seconds!` }),
            h('div', { class: 'result-actions' },
              h('button', { class: 'btn btn-primary', onclick: () => startTurn() }, `Start ${ctx.names[1]}'s turn`))),
        );
        panel.querySelector('button')?.focus({ preventScroll: true });
        return;
      }
      // Match over
      if (duel) {
        const winner = scores[0] === scores[1] ? 'draw' : scores[0] > scores[1] ? 0 : 1;
        stats.record('whack', { winner });
        sfx.play('win');
        panel.append(
          h('div', { class: 'result-card inline', role: 'dialog', 'aria-label': 'Match over' },
            h('div', { class: 'result-emoji', text: winner === 'draw' ? '🤝' : '🏆' }),
            h('h2', {
              text: winner === 'draw'
                ? `Tied ${scores[0]}–${scores[1]}!`
                : `${ctx.names[winner]} wins ${Math.max(...scores)}–${Math.min(...scores)}!`,
            }),
            h('div', { class: 'result-actions' },
              h('button', { class: 'btn btn-primary', onclick: () => restart() }, 'Play again'))),
        );
      } else {
        stats.record('whack', { winner: null, score: scores[0] });
        sfx.play('win');
        panel.append(
          h('div', { class: 'result-card inline', role: 'dialog', 'aria-label': 'Run over' },
            h('div', { class: 'result-emoji', text: '🔨' }),
            h('h2', { text: `You bonked ${scores[0]}!` }),
            h('p', { class: 'muted', text: `Best: ${stats.get('whack').best}` }),
            h('div', { class: 'result-actions' },
              h('button', { class: 'btn btn-primary', onclick: () => restart() }, 'Go again'))),
        );
      }
      panel.querySelector('button')?.focus({ preventScroll: true });
    }

    function startTurn() {
      clear(panel);
      timeLeft = DURATION_S;
      moles = new Array(9).fill(null);
      playing = true;
      paintHud();
      paintField();
      sfx.play('click');
      stopTimers();
      spawnTimer = setInterval(spawn, level.spawnMs);
      tickTimer = setInterval(() => {
        timeLeft -= 0.25;
        if (timeLeft <= 5.25 && timeLeft > 0 && Math.abs(timeLeft % 1) < 0.26) sfx.play('tick');
        if (timeLeft <= 0) {
          timeLeft = 0;
          endTurn();
          return;
        }
        paintHud();
      }, 250);
      spawn();
    }

    function restart() {
      turn = 0;
      scores = [0, 0];
      startTurn();
    }

    paintHud();
    paintField();
    panel.append(
      h('div', { class: 'result-card inline' },
        h('div', { class: 'result-emoji', text: '🐹' }),
        h('h2', { text: duel ? `${ctx.names[0]} goes first` : 'Ready to bonk?' }),
        h('p', { class: 'muted', text: `${DURATION_S} seconds · golden moles worth 3` }),
        h('div', { class: 'result-actions' },
          h('button', { class: 'btn btn-primary', onclick: () => startTurn() }, 'Start'))),
    );

    return () => {
      destroyed = true;
      playing = false;
      stopTimers();
    };
  },
};
