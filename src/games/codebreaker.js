// Codebreaker — crack the secret color code in limited tries.
import { h, clear } from '../core/dom.js';
import { sfx } from '../core/sound.js';
import { stats } from '../core/store.js';

export const COLORS = [
  { name: 'Red', hex: '#ef4444', key: 'R', dark: false },
  { name: 'Blue', hex: '#3b82f6', key: 'B', dark: false },
  { name: 'Green', hex: '#22c55e', key: 'G', dark: false },
  { name: 'Yellow', hex: '#eab308', key: 'Y', dark: true },
  { name: 'Purple', hex: '#a855f7', key: 'P', dark: false },
  { name: 'Orange', hex: '#f97316', key: 'O', dark: false },
  { name: 'Pink', hex: '#ec4899', key: 'K', dark: false },
  { name: 'Cyan', hex: '#06b6d4', key: 'C', dark: true },
];

export const LEVELS = {
  easy: { pegs: 4, colors: 6, tries: 12 },
  medium: { pegs: 4, colors: 8, tries: 10 },
  hard: { pegs: 5, colors: 8, tries: 10 },
};

/** bulls = right color right spot, cows = right color wrong spot. */
export function scoreGuess(secret, guess) {
  let bulls = 0;
  const sCount = {};
  const gCount = {};
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) bulls += 1;
    else {
      sCount[secret[i]] = (sCount[secret[i]] || 0) + 1;
      gCount[guess[i]] = (gCount[guess[i]] || 0) + 1;
    }
  }
  let cows = 0;
  for (const k of Object.keys(gCount)) cows += Math.min(gCount[k], sCount[k] || 0);
  return { bulls, cows };
}

export function randomSecret(pegs, colors, rng = Math.random) {
  return Array.from({ length: pegs }, () => Math.floor(rng() * colors));
}

function peg(colorIdx, extra = '') {
  const c = COLORS[colorIdx];
  const el = h('span', { class: `cb-peg${extra ? ` ${extra}` : ''}`, title: c.name, text: c.key });
  el.style.background = c.hex;
  el.style.color = c.dark ? '#0b0e1a' : '#ffffff';
  return el;
}

export default {
  id: 'codebreaker',
  name: 'Codebreaker',
  tagline: 'Crack the secret color code.',
  genre: 'Puzzle',
  players: 'both',
  icon: '🕵️',
  hue: 190,
  modes: [
    { id: 'solo', label: 'Crack the code' },
    { id: 'local', label: 'Friend sets it' },
  ],
  difficulties: [
    { id: 'easy', label: '4 pegs · 12 tries' },
    { id: 'medium', label: '4 pegs · 10 tries' },
    { id: 'hard', label: '5 pegs · 10 tries' },
  ],
  howTo: [
    'Guess the hidden color code. Colors may repeat.',
    '● black dot: right color, right spot. ○ white dot: right color, wrong spot.',
    'Dots are not ordered — logic out which peg earned what.',
  ],
  mount(root, ctx) {
    const level = LEVELS[ctx.difficulty] || LEVELS.medium;
    const { pegs, colors, tries } = level;
    const palette = COLORS.slice(0, colors);
    let secret = ctx.mode === 'solo' ? randomSecret(pegs, colors) : null;
    let history = [];
    let current = [];
    let over = false;
    let won = false;

    const wrap = h('div', { class: 'cb-wrap' });
    const historyEl = h('div', { class: 'cb-history', 'aria-live': 'polite' });
    const entryEl = h('div', { class: 'cb-entry' });
    const paletteEl = h('div', { class: 'cb-palette' });
    const statusEl = h('div', { class: 'table-status' });
    wrap.append(statusEl, historyEl, entryEl, paletteEl);
    root.append(wrap);

    function renderStatus() {
      clear(statusEl);
      const left = tries - history.length;
      statusEl.append(
        h('span', { class: 'turn-dot p0' }),
        h('span', { text: over ? (won ? 'Code cracked!' : 'Out of tries') : `${left} ${left === 1 ? 'try' : 'tries'} left` }),
      );
    }

    function renderHistory() {
      clear(historyEl);
      history.forEach((row, i) => {
        const pegsEl = h('div', { class: 'cb-row-pegs' });
        row.guess.forEach((g) => pegsEl.append(peg(g)));
        const dots = h('div', { class: 'cb-row-dots' });
        for (let b = 0; b < row.score.bulls; b++) dots.append(h('span', { class: 'cb-dot bull', text: '●' }));
        for (let c = 0; c < row.score.cows; c++) dots.append(h('span', { class: 'cb-dot cow', text: '○' }));
        historyEl.append(
          h('div', { class: 'cb-row' },
            h('span', { class: 'cb-row-num', text: `#${i + 1}` }), pegsEl, dots),
        );
      });
      if (!over && secret) {
        const cur = h('div', { class: 'cb-row current' });
        const pegsEl = h('div', { class: 'cb-row-pegs' });
        for (let i = 0; i < pegs; i++) {
          pegsEl.append(
            current[i] === undefined
              ? h('span', { class: 'cb-peg empty', text: '·' })
              : peg(current[i]),
          );
        }
        cur.append(h('span', { class: 'cb-row-num', text: `#${history.length + 1}` }), pegsEl);
        historyEl.append(cur);
      }
    }

    function renderPalette(onPick, actionLabel, onAction, actionDisabled) {
      clear(paletteEl);
      palette.forEach((c, i) => {
        const btn = h('button', {
          class: 'cb-key',
          'aria-label': `Add ${c.name}`,
          onclick: () => onPick(i),
        });
        btn.style.background = c.hex;
        btn.textContent = c.key;
        btn.style.color = c.dark ? '#0b0e1a' : '#fff';
        paletteEl.append(btn);
      });
      paletteEl.append(
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => onPick('back') }, '⌫'),
        h('button', { class: 'btn btn-primary btn-sm', disabled: actionDisabled, onclick: onAction }, actionLabel),
      );
    }

    function renderEntrySecretSetter() {
      clear(entryEl);
      const row = h('div', { class: 'cb-setter' });
      for (let i = 0; i < pegs; i++) {
        row.append(
          current[i] === undefined
            ? h('span', { class: 'cb-peg empty', text: '·' })
            : peg(current[i]),
        );
      }
      entryEl.append(
        h('p', { class: 'muted', text: 'Setter: build the secret code, then pass the device.' }),
        row,
      );
    }

    function finish() {
      over = true;
      renderStatus();
      renderHistory();
      clear(paletteEl);
      clear(entryEl);
      if (won) {
        sfx.play('win');
        stats.record('codebreaker', { winner: null, score: Math.max(1, (tries - history.length + 1) * 100) });
      } else {
        sfx.play('lose');
        stats.record('codebreaker', { winner: null });
      }
      const reveal = h('div', { class: 'cb-reveal' });
      secret.forEach((s) => reveal.append(peg(s)));
      entryEl.append(
        h('div', { class: 'result-card inline', role: 'dialog', 'aria-label': won ? 'Cracked' : 'Failed' },
          h('div', { class: 'result-emoji', text: won ? '🕵️' : '🔒' }),
          h('h2', { text: won ? `Cracked in ${history.length}!` : 'The code survives' }),
          reveal,
          h('div', { class: 'result-actions' },
            h('button', { class: 'btn btn-primary', onclick: () => restart() }, 'Play again'))),
      );
      entryEl.querySelector('button')?.focus({ preventScroll: true });
    }

    function submitGuess() {
      if (over || current.length !== pegs) return;
      const score = scoreGuess(secret, current);
      history.push({ guess: current.slice(), score });
      current = [];
      sfx.play(score.bulls === pegs ? 'win' : score.bulls > 0 ? 'good' : 'move');
      if (score.bulls === pegs) {
        won = true;
        return finish();
      }
      if (history.length >= tries) return finish();
      renderStatus();
      renderHistory();
      renderPalette(pickGuess, 'Check', submitGuess, true);
    }

    function pickGuess(choice) {
      if (over) return;
      if (choice === 'back') current.pop();
      else if (current.length < pegs) {
        current.push(choice);
        sfx.play('click');
      }
      renderHistory();
      renderPalette(pickGuess, 'Check', submitGuess, current.length !== pegs);
    }

    function pickSecret(choice) {
      if (choice === 'back') current.pop();
      else if (current.length < pegs) {
        current.push(choice);
        sfx.play('click');
      }
      renderEntrySecretSetter();
      renderPalette(pickSecret, 'Hide it — pass the device', lockSecret, current.length !== pegs);
    }

    function lockSecret() {
      if (current.length !== pegs) return;
      secret = current.slice();
      current = [];
      history = [];
      sfx.play('good');
      clear(entryEl);
      entryEl.append(h('p', { class: 'muted', text: `${ctx.names[1]}: crack the code!` }));
      renderStatus();
      renderHistory();
      renderPalette(pickGuess, 'Check', submitGuess, true);
    }

    function restart() {
      secret = ctx.mode === 'solo' ? randomSecret(pegs, colors) : null;
      history = [];
      current = [];
      over = false;
      won = false;
      sfx.play('click');
      renderStatus();
      renderHistory();
      if (ctx.mode === 'solo') {
        clear(entryEl);
        renderPalette(pickGuess, 'Check', submitGuess, true);
      } else {
        renderEntrySecretSetter();
        renderPalette(pickSecret, 'Hide it — pass the device', lockSecret, true);
      }
    }

    renderStatus();
    renderHistory();
    if (ctx.mode === 'solo') {
      renderPalette(pickGuess, 'Check', submitGuess, true);
    } else {
      renderEntrySecretSetter();
      renderPalette(pickSecret, 'Hide it — pass the device', lockSecret, true);
    }

    return () => {};
  },
};
