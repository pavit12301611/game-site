/**
 * Race engine: tap sprint games.
 *
 * Options: { target: number, tapGapMs: number }
 * Real-time race: players tap to fill their meter. No turns.
 */

import { assertPlaying, declareWinner } from './shared.js';

export function createInitialState(game, players, seed) {
  return {
    engine: 'race',
    scores: Object.fromEntries(players.map(p => [p.uid, 0])),
    lastTapMs: Object.fromEntries(players.map(p => [p.uid, 0])),
    turnIndex: 0, // not used for turns but kept for consistency
    status: 'playing',
    winner: '',
    target: game.options.target,
    seed,
  };
}

export function applyAction(game, state, uid, action, players) {
  assertPlaying(state);
  if (!players.some(p => p.uid === uid)) throw new Error('You are not in this game.');
  const { tapGapMs } = game.options;
  const now = Date.now();

  if (tapGapMs > 0) {
    const lastTap = state.lastTapMs[uid] || 0;
    if (now - lastTap < tapGapMs) return state; // Too fast, silently ignore
  }

  state.lastTapMs[uid] = now;
  state.scores[uid] = (state.scores[uid] || 0) + 1;

  if (state.scores[uid] >= game.options.target) {
    declareWinner(state, uid);
  }

  return state;
}