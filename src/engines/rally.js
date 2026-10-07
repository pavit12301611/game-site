/**
 * Rally engine: court volley games (pong rally, paddle wars, air hockey).
 *
 * Options: { target: number, lanes: number }
 * Players alternate returns; every clean volley scores a point for the returning player.
 */

import { seededRandom, assertPlaying, currentPlayer, advanceTurn, declareWinner, assertTurn, assertInRange } from './shared.js';

export function createInitialState(game, players, seed) {
  return {
    engine: 'rally',
    scores: Object.fromEntries(players.map(p => [p.uid, 0])),
    turnIndex: 0,
    status: 'playing',
    winner: '',
    rallyCount: 0,
    lastReturn: -1,
    seed,
  };
}

export function applyAction(game, state, uid, action, players) {
  assertPlaying(state);
  const current = currentPlayer(state, players);
  assertTurn(uid, current);
  const { lane } = action;
  assertInRange(lane, 0, game.options.lanes);

  state.lastReturn = lane;
  state.rallyCount++;

  // Every return scores a point for the returning player
  state.scores[uid] = (state.scores[uid] || 0) + 1;

  if (state.scores[uid] >= game.options.target) {
    declareWinner(state, uid);
    return state;
  }

  advanceTurn(state, players.length);
  return state;
}