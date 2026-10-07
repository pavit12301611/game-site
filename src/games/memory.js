// Memory Match — flip pairs, remember everything. Hard mode forgets nothing.
import { h } from '../core/dom.js';
import { shuffle } from '../core/dom.js';
import { createTable } from './table.js';

export const ICONS = ['🚀', '🎮', '🍕', '🐙', '🌙', '⚡', '🍩', '🐸', '🎲', '🦄', '🍒', '🤖', '🌵', '🎧', '🍉', '🐝'];
export const PAIRS = { easy: 6, medium: 8, hard: 12 };

export function buildDeck(pairs, rng = Math.random) {
  const faces = ICONS.slice(0, pairs);
  return shuffle([...faces, ...faces], rng).map((icon, id) => ({ id, icon, matched: false }));
}

export function newSetup(difficulty) {
  return {
    deck: buildDeck(PAIRS[difficulty] || PAIRS.medium),
    open: [],
    seen: {},
    scores: [0, 0],
    turn: 0,
    lock: false,
  };
}

function knownMatch(s, icon, exclude) {
  return (s.seen[icon] || []).find((i) => i !== exclude && !s.deck[i].matched && !s.open.includes(i));
}

function knownPairFirst(s) {
  for (const icon of Object.keys(s.seen)) {
    const avail = (s.seen[icon] || []).filter((i) => !s.deck[i].matched && !s.open.includes(i));
    if (avail.length >= 2) return avail[0];
  }
  return -1;
}

export function cpuPick(s, difficulty) {
  const closed = s.deck.map((c, i) => i).filter((i) => !s.deck[i].matched && !s.open.includes(i));
  if (closed.length === 0) return null;
  const randomClosed = () => closed[Math.floor(Math.random() * closed.length)];
  const unseen = closed.filter((i) => !Object.values(s.seen).flat().includes(i));
  const fresh = unseen.length > 0 ? unseen : closed;
  const freshPick = () => fresh[Math.floor(Math.random() * fresh.length)];

  if (difficulty === 'easy') return randomClosed();
  const forgetful = difficulty === 'medium' && Math.random() < 0.45;
  if (s.open.length === 1) {
    const need = s.deck[s.open[0]].icon;
    const known = knownMatch(s, need, s.open[0]);
    if (known !== undefined && !forgetful) return known;
    return randomClosed();
  }
  if (!forgetful) {
    const pair = knownPairFirst(s);
    if (pair >= 0) return pair;
  }
  return freshPick();
}

export default {
  id: 'memory',
  name: 'Memory Match',
  tagline: 'Flip cards. Remember everything.',
  genre: 'Puzzle',
  players: 'both',
  icon: '🃏',
  hue: 275,
  modes: [
    { id: 'cpu', label: 'Vs CPU' },
    { id: 'local', label: '2 Players' },
  ],
  difficulties: [
    { id: 'easy', label: '6 pairs' },
    { id: 'medium', label: '8 pairs' },
    { id: 'hard', label: '12 pairs' },
  ],
  howTo: [
    'Flip two cards. A matching pair scores and flips again.',
    'Miss, and the turn passes — but you saw the cards. Remember them.',
    'Most pairs when the board clears wins.',
  ],
  mount(root, ctx) {
    const players = ctx.mode === 'cpu' ? [ctx.names[0], 'CPU'] : ctx.names;
    const pairs = PAIRS[ctx.difficulty] || PAIRS.medium;
    const table = createTable(root, {
      gameId: 'memory',
      mode: ctx.mode,
      players,
      difficulty: ctx.difficulty,
      setup: () => newSetup(ctx.difficulty),
      busy: (s) => s.lock,
      statusOf: (s) => ({
        text: `${players[0]} ${s.scores[0]} · ${s.scores[1]} ${players[1]} — ${players[s.turn]} to flip`,
        turn: s.turn,
      }),
      applyMove: (s, m, control) => {
        const i = m;
        if (typeof i !== 'number' || s.lock) return { state: s, silent: true };
        const card = s.deck[i];
        if (!card || card.matched || s.open.includes(i)) return { state: s, silent: true };
        const seen = { ...s.seen };
        seen[card.icon] = [...(seen[card.icon] || []).filter((x) => x !== i), i];
        const open = [...s.open, i];
        if (open.length < 2) {
          return { state: { ...s, open, seen }, sound: 'flip' };
        }
        if (s.deck[open[0]].icon === card.icon) {
          const deck = s.deck.map((c, idx) =>
            idx === open[0] || idx === i ? { ...c, matched: true } : c,
          );
          const scores = s.scores.slice();
          scores[s.turn] += 1;
          return { state: { ...s, deck, open: [], seen, scores }, sound: 'good' };
        }
        const next = { ...s, open, seen, lock: true };
        control.defer(750, (api) => {
          const cur = api.getState();
          api.setState({ ...cur, open: [], turn: cur.turn ^ 1, lock: false });
        });
        return { state: next, sound: 'flip' };
      },
      resultOf: (s) => {
        if (!s.deck.every((c) => c.matched)) return null;
        const [a, b] = s.scores;
        return {
          winner: a === b ? 'draw' : a > b ? 0 : 1,
          label: a === b ? `Tied ${a}–${b}!` : `${players[a > b ? 0 : 1]} remembers best, ${Math.max(a, b)}–${Math.min(a, b)}!`,
        };
      },
      cpuMove: (s, d) => cpuPick(s, d),
      renderBoard: (el, s, api) => {
        const cpuToMove = ctx.mode === 'cpu' && s.turn === 1;
        const cols = pairs <= 6 ? 4 : pairs <= 8 ? 4 : 6;
        const grid = h('div', {
          class: 'mem-grid',
          role: 'grid',
          'aria-label': 'Memory board',
        });
        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        s.deck.forEach((card, i) => {
          const faceUp = card.matched || s.open.includes(i);
          grid.append(
            h('button', {
              class: `mem-card${faceUp ? ' open' : ''}${card.matched ? ' matched' : ''}`,
              disabled: faceUp || api.disabled || cpuToMove || s.lock,
              'aria-label': faceUp ? card.icon : `Face-down card ${i + 1}`,
              onclick: () => api.move(i),
            }, h('span', { class: 'mem-face', text: faceUp ? card.icon : '?' })),
          );
        });
        el.append(grid);
      },
    });
    return () => table.destroy();
  },
};
