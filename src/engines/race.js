/**
 * race engine — real-time button mashing, no turns: first player to the target score wins.
 * Games: Pixel Tap Sprint, Button Masher, Turbo Charge, Reaction Rush, Spacebar Showdown, Bug Blaster.
 */
import { assertPlaying, createRaceState } from './shared.js';

export function createInitialState(game, players) {
  return createRaceState(game, players);
}

export function applyAction(game, state, uid, action, players) {
  assertPlaying(state);
  if (action.type !== 'tap') throw new Error('Tap the boost button to score.');
  const scoreMap = { ...state.scores, [uid]: (state.scores[uid] ?? 0) + 1 };
  state.scores = scoreMap;
  state.moves += 1;
  state.lastAction = { uid, time: state.moves };
  if (scoreMap[uid] >= state.target) {
    state.phase = 'finished';
    state.winnerUid = uid;
    state.result = 'winner';
  }
  return state;
}
