/**
 * Memory engine: card matching games.
 *
 * Options: { pairs: number, openPairs: number, matchKeepsTurn: boolean }
 */

import { seededRandom, assertPlaying, currentPlayer, advanceTurn, declareWinner, assertTurn } from './shared.js';

const CARD_SYMBOLS = '♠♥♦♣★◆●◎✦□△▽⬡⬢⬟⬠楪♢';

export function memoryCardIcon(index) {
  return CARD_SYMBOLS[index % CARD_SYMBOLS.length];
}

export function createInitialState(game, players, seed) {
  const rng = seededRandom(seed);
  const { pairs, openPairs } = game.options;
  const totalCards = pairs * 2;

  // Create pairs of card indices
  let cards = [];
  for (let i = 0; i < pairs; i++) {
    cards.push(i, i);
  }
  // Fisher-Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  const revealed = Array(totalCards).fill(false);
  const matched = Array(totalCards).fill(false);

  // Open some pairs
  const openedPairs = new Set();
  for (let i = 0; i < Math.min(openPairs, pairs) && openedPairs.size < pairs; i++) {
    let pairId;
    do { pairId = Math.floor(rng() * pairs); } while (openedPairs.has(pairId));
    openedPairs.add(pairId);
    const first = cards.indexOf(pairId);
    const second = cards.indexOf(pairId, first + 1);
    revealed[first] = true;
    revealed[second] = true;
    matched[first] = true;
    matched[second] = true;
  }

  return {
    engine: 'memory',
    cards,
    revealed,
    matched,
    turnIndex: 0,
    selected: [], // indices of currently flipped cards (max 2)
    scores: Object.fromEntries(players.map(p => [p.uid, 0])),
    status: 'playing',
    winner: '',
    lastFlipped: [],
    seed,
  };
}

export function applyAction(game, state, uid, action, players) {
  assertPlaying(state);
  const current = currentPlayer(state, players);
  assertTurn(uid, current);
  const { index } = action;

  if (index < 0 || index >= state.cards.length) throw new Error('Invalid card.');
  if (state.matched[index]) throw new Error('That card is already matched.');
  if (state.revealed[index] && state.selected.includes(index)) throw new Error('That card is already flipped.');
  if (state.selected.length >= 2) throw new Error('Wait for the turn to resolve.');

  state.selected.push(index);
  state.revealed[index] = true;
  state.lastFlipped = [...state.selected];

  if (state.selected.length === 2) {
    const [a, b] = state.selected;
    if (state.cards[a] === state.cards[b]) {
      // Match!
      state.matched[a] = true;
      state.matched[b] = true;
      state.scores[uid] = (state.scores[uid] || 0) + 1;
      state.selected = [];

      // Check if all matched
      if (state.matched.every(Boolean)) {
        // Find winner by highest score
        let maxScore = -1;
        let winner = '';
        for (const [pUid, score] of Object.entries(state.scores)) {
          if (score > maxScore) { maxScore = score; winner = pUid; }
        }
        state.status = 'finished';
        state.winner = winner;
        return state;
      }

      // Match keeps turn?
      if (game.options.matchKeepsTurn) return state;
      advanceTurn(state, players.length);
      return state;
    }

    // No match — hide after a beat (the state keeps revealed=true; the UI animates it)
    state.selected = [];
    advanceTurn(state, players.length);
  }

  return state;
}