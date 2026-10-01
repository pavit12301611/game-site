/**
 * memory engine — flip two cards; a match scores and keeps the turn, a miss passes it on.
 * Games: Memory Match, Neon Pairs, Emoji Flip, Arcade Pairs.
 */

/** @typedef {import('../types.js').Game} Game */
/** @typedef {import('../types.js').Player} Player */
/** @typedef {import('../types.js').GameState} GameState */
/** @typedef {import('../types.js').Action} Action */

import { advanceTurn, assertPlaying, assertTurn, finishByScore, newBase, scoresFor, shuffled } from './shared.js';

/** Card faces. Keep at least as many entries as the largest `options.pairs` in the catalog. */
export const MEMORY_ICONS = ['✦', '☻', '♫', '◆', '⚡', '☾', '✿', '◉', '♜', '▲', '●', '▣'];

/** @param {number} index @returns {string} the face shown on a revealed card. */
export function memoryCardIcon(index) {
  return MEMORY_ICONS[index % MEMORY_ICONS.length];
}

/**
 * @param {Game} game
 * @param {Player[]} players
 * @param {string} [seed]
 * @returns {GameState}
 */
export function createInitialState(game, players, seed) {
  const ids = players.map((player) => player.uid);
  const pairs = Math.min(game.options.pairs, MEMORY_ICONS.length);
  const icons = shuffled(MEMORY_ICONS, `${seed}:${game.id}`).slice(0, pairs);
  const cards = shuffled([...icons, ...icons], `${seed}:${game.id}:deck`);
  return {
    ...newBase(players, ids[0]),
    cards,
    opened: [],
    matched: [],
    scores: scoresFor(ids),
    round: 1,
  };
}

/**
 * @param {Game} game
 * @param {GameState} state
 * @param {string} uid
 * @param {Action} action
 * @param {Player[]} players
 * @returns {GameState}
 */
export function applyAction(game, state, uid, action, players) {
  assertPlaying(state);
  assertTurn(state, uid);
  const index = Number(action.index);
  if (!Number.isInteger(index) || index < 0 || index >= state.cards.length || state.matched.includes(index)) {
    throw new Error('That card is not available.');
  }
  if (state.opened.length === 1 && state.opened[0] === index) throw new Error('Flip a different card.');
  const opened = state.opened.length >= 2 ? [] : [...state.opened];
  opened.push(index);
  state.opened = opened;
  state.moves += 1;
  if (opened.length === 2) {
    const [first, second] = opened;
    if (state.cards[first] === state.cards[second]) {
      state.matched = [...state.matched, first, second];
      state.scores[uid] = (state.scores[uid] ?? 0) + 1;
      if (state.matched.length === state.cards.length) finishByScore(state, players, state.scores);
    } else {
      advanceTurn(state, players, uid);
    }
  }
  return state;
}
