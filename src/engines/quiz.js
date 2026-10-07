/**
 * Quiz engine: multiple-choice rounds.
 *
 * Options: { rounds: number }
 * Questions are dealt from a bank (seeded). All players answer, then the round reveals.
 */

import { seededRandom, assertPlaying, declareWinner } from './shared.js';

export function createInitialState(game, players, seed, deps) {
  const bank = deps?.bank || [];
  const rng = seededRandom(seed);
  const { rounds } = game.options;

  // Shuffle and pick questions
  const shuffled = [...bank];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const questions = shuffled.slice(0, rounds);

  return {
    engine: 'quiz',
    questions,
    currentRound: 0,
    answers: {}, // uid -> answer index for current round
    roundRevealed: false,
    scores: Object.fromEntries(players.map(p => [p.uid, 0])),
    turnIndex: 0,
    status: 'playing',
    winner: '',
    seed,
  };
}

export function applyAction(game, state, uid, action, players) {
  assertPlaying(state);
  if (!players.some(p => p.uid === uid)) throw new Error('You are not in this game.');

  // "next" action: reveal and advance
  if (action.type === 'next') {
    if (!state.roundRevealed) {
      // Reveal the round
      state.roundRevealed = true;
      const q = state.questions[state.currentRound];
      if (q) {
        for (const [pUid, ans] of Object.entries(state.answers)) {
          if (ans === q.answer) state.scores[pUid] = (state.scores[pUid] || 0) + 1;
        }
      }
      return state;
    }

    // Advance to next round
    state.currentRound++;
    state.answers = {};
    state.roundRevealed = false;

    if (state.currentRound >= game.options.rounds) {
      // Game over: find winner
      let max = -1;
      let winner = 'draw';
      for (const [pUid, score] of Object.entries(state.scores)) {
        if (score > max) { max = score; winner = pUid; }
        else if (score === max) winner = 'draw';
      }
      state.status = 'finished';
      state.winner = winner;
      return state;
    }

    return state;
  }

  // Answer action
  if (state.roundRevealed) throw new Error('This round is already revealed.');
  if (state.answers[uid] !== undefined) throw new Error('You already answered this round.');

  const { answer } = action;
  if (typeof answer !== 'number' || answer < 0 || answer > 3)
    throw new Error('Pick an answer between A and D.');

  state.answers[uid] = answer;
  return state;
}