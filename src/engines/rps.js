/**
 * RPS engine: simultaneous pick games (rock-paper-scissors, coin flip, dice duel).
 *
 * Options: { target: number, mode: 'rps'|'coin'|'dice' }
 * All players pick simultaneously, then the round resolves.
 */

import { seededRandom, assertPlaying, declareWinner } from './shared.js';

export function createInitialState(game, players, seed) {
  return {
    engine: 'rps',
    round: 1,
    scores: Object.fromEntries(players.map(p => [p.uid, 0])),
    picks: {}, // uid -> choice
    roundResult: null, // { winners: [], losers: [], ties: [] }
    turnIndex: 0,
    status: 'playing',
    winner: '',
    seed,
  };
}

const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

export function applyAction(game, state, uid, action, players) {
  assertPlaying(state);
  if (!players.some(p => p.uid === uid)) throw new Error('You are not in this game.');
  if (state.picks[uid] !== undefined) throw new Error('You already picked this round.');

  const { choice } = action;
  state.picks[uid] = choice;

  // Check if everyone has picked
  if (Object.keys(state.picks).length < players.length) return state;

  // Resolve the round
  const result = resolveRound(game.options, state.picks, players);
  state.roundResult = result;

  for (const uid of result.winners) {
    state.scores[uid] = (state.scores[uid] || 0) + 1;
    if (state.scores[uid] >= game.options.target) {
      declareWinner(state, uid);
      return state;
    }
  }

  // Reset for next round
  state.picks = {};
  state.round++;
  return state;
}

function resolveRound(options, picks, players) {
  const { mode } = options;
  const uids = Object.keys(picks);

  if (mode === 'coin') {
    // The flip is fixed per round (seeded)
    const rng = seededRandom(String(Date.now()));
    const flip = rng() > 0.5 ? 'heads' : 'tails';
    const winners = uids.filter(uid => picks[uid] === flip);
    return { winners, flip };
  }

  if (mode === 'dice') {
    // Highest unique roll wins
    const values = {};
    for (const uid of uids) values[uid] = Number(picks[uid]) || 0;
    const max = Math.max(...Object.values(values));
    const topPickers = uids.filter(uid => values[uid] === max);
    if (topPickers.length === 1) return { winners: topPickers };
    return { winners: [] }; // Tie at the top
  }

  // Default: rock-paper-scissors
  const uniquePicks = [...new Set(uids.map(uid => picks[uid]))];
  if (uniquePicks.length === 1) return { winners: [] }; // Everyone picked the same

  if (uniquePicks.length === 2) {
    const [a, b] = uniquePicks;
    const winner = BEATS[a] === b ? a : BEATS[b] === a ? b : null;
    if (!winner) return { winners: [] };
    const winners = uids.filter(uid => picks[uid] === winner);
    return { winners };
  }

  // Three-way: each pick beats one other — it's a tie
  return { winners: [] };
}