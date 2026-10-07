// Rock · Paper · Scissors — the 2,000-year-old duel, now with mind games.
import { h, clear } from '../core/dom.js';
import { sfx } from '../core/sound.js';
import { stats } from '../core/store.js';

export const MOVES = ['rock', 'paper', 'scissors'];
export const EMOJI = { rock: '✊', paper: '✋', scissors: '✌️' };
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

export function decide(a, b) {
  if (a === b) return 'draw';
  return BEATS[a] === b ? 0 : 1;
}

function cpuThrow(history, difficulty) {
  const random = () => MOVES[Math.floor(Math.random() * 3)];
  if (difficulty === 'easy' || history.length === 0) return random();
  // Counter the player's most frequent throw.
  const freq = { rock: 0, paper: 0, scissors: 0 };
  for (const h of history) freq[h] += 1;
  const fav = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  const counter = Object.keys(BEATS).find((m) => BEATS[m] === fav);
  if (difficulty === 'medium') return Math.random() < 0.6 ? counter : random();
  // Hard: punish repeats instantly, otherwise counter tendencies.
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  if (last && last === prev) return Object.keys(BEATS).find((m) => BEATS[m] === last);
  return Math.random() < 0.8 ? counter : random();
}

export default {
  id: 'rps',
  name: 'Rock Paper Scissors',
  tagline: 'Read minds. Throw hands.',
  genre: 'Party',
  players: 'both',
  icon: '✊',
  hue: 0,
  modes: [
    { id: 'cpu', label: 'Vs CPU' },
    { id: 'local', label: '2 Players' },
  ],
  difficulties: [
    { id: 'easy', label: 'Random' },
    { id: 'medium', label: 'Watchful' },
    { id: 'hard', label: 'Mind reader' },
  ],
  howTo: [
    'Rock crushes scissors. Scissors cut paper. Paper covers rock.',
    'Vs CPU: first to 5 takes the match. 2 Players: first to 3.',
    'Hard CPU studies your habits — stay unpredictable.',
  ],
  mount(root, ctx) {
    const duel = ctx.mode === 'local';
    const target = duel ? 3 : 5;
    const players = duel ? ctx.names : [ctx.names[0], 'CPU'];
    let scores = [0, 0];
    let round = 1;
    let over = false;
    let pending = null; // P1's hidden throw in duel mode
    let history = [];

    const scoreEl = h('div', { class: 'rps-score' });
    const stage = h('div', { class: 'rps-stage', 'aria-live': 'polite' });
    const controls = h('div', { class: 'rps-controls' });
    root.append(scoreEl, stage, controls);

    function paintScore() {
      clear(scoreEl);
      scoreEl.append(
        h('div', { class: 'rps-side' }, h('strong', { text: players[0] }), h('span', { class: 'rps-num', text: String(scores[0]) })),
        h('div', { class: 'rps-mid', text: `Round ${round} · first to ${target}` }),
        h('div', { class: 'rps-side' }, h('strong', { text: players[1] }), h('span', { class: 'rps-num', text: String(scores[1]) })),
      );
    }

    function throwButtons(prompt, onThrow) {
      clear(controls);
      controls.append(h('p', { class: 'rps-prompt', text: prompt }));
      const row = h('div', { class: 'rps-throws' });
      for (const m of MOVES) {
        row.append(
          h('button', { class: 'rps-btn', onclick: () => onThrow(m), 'aria-label': m },
            h('span', { class: 'rps-emoji', text: EMOJI[m] }), h('span', { text: m })),
        );
      }
      controls.append(row);
    }

    function showdown(a, b) {
      const result = decide(a, b);
      clear(stage);
      stage.append(
        h('div', { class: `rps-hand${result === 0 ? ' winner' : ''}`, text: EMOJI[a] }),
        h('div', { class: 'rps-vs', text: result === 'draw' ? 'draw' : 'vs' }),
        h('div', { class: `rps-hand${result === 1 ? ' winner' : ''}`, text: EMOJI[b] }),
      );
      if (result === 'draw') {
        sfx.play('draw');
      } else {
        scores[result] += 1;
        sfx.play(duel || result === 0 ? 'good' : 'error');
      }
      round += 1;
      paintScore();
      if (scores[0] >= target || scores[1] >= target) return finish();
      setTimeout(promptTurn, 900);
    }

    function promptTurn() {
      if (over) return;
      clear(stage);
      if (!duel) {
        stage.append(h('p', { class: 'muted', text: 'Choose your throw…' }));
        throwButtons(`${players[0]}, throw!`, (m) => {
          history.push(m);
          showdown(m, cpuThrow(history, ctx.difficulty));
        });
      } else if (pending === null) {
        stage.append(h('p', { class: 'muted', text: `${players[1]}, look away!` }));
        throwButtons(`${players[0]}, pick in secret…`, (m) => {
          pending = m;
          sfx.play('click');
          promptTurn();
        });
      } else {
        stage.append(h('p', { class: 'muted', text: `${players[0]}, look away!` }));
        throwButtons(`${players[1]}, your throw!`, (m) => {
          const a = pending;
          pending = null;
          showdown(a, m);
        });
      }
    }

    function finish() {
      over = true;
      const winner = scores[0] > scores[1] ? 0 : 1;
      sfx.play(duel || winner === 0 ? 'win' : 'lose');
      stats.record('rps', { winner });
      clear(controls);
      controls.append(
        h('div', { class: 'result-card inline', role: 'dialog', 'aria-label': 'Match over' },
          h('div', { class: 'result-emoji', text: '🏆' }),
          h('h2', { text: `${players[winner]} wins ${scores[winner]}–${scores[winner ^ 1]}!` }),
          h('div', { class: 'result-actions' },
            h('button', { class: 'btn btn-primary', onclick: () => restart() }, 'Rematch'))),
      );
      controls.querySelector('button')?.focus({ preventScroll: true });
    }

    function restart() {
      scores = [0, 0];
      round = 1;
      over = false;
      pending = null;
      history = [];
      sfx.play('click');
      paintScore();
      promptTurn();
    }

    paintScore();
    promptTurn();
    return () => {};
  },
};
