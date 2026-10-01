/**
 * rps engine — everyone locks in a hidden choice, the round resolves when the last one lands.
 * Games: Rock Paper Scissors, Laser Duel (mode rps), Coin Flip Clash (mode coin), Dice Duel (mode dice).
 */

/** @typedef {import('../types.js').Game} Game */
/** @typedef {import('../types.js').Player} Player */
/** @typedef {import('../types.js').GameState} GameState */
/** @typedef {import('../types.js').Action} Action */

import { assertPlaying, finishByScore, hashNumber, newBase, scoresFor } from './shared.js';

/** @param {string} mode @returns {string[]} the legal choices for this game. */
export function choicesForMode(mode) {
  if (mode === 'rps') return ['rock', 'paper', 'scissors'];
  if (mode === 'coin') return ['heads', 'tails'];
  return ['1', '2', '3', '4', '5', '6'];
}

/**
 * @param {Game} game
 * @param {Player[]} players
 * @returns {GameState}
 */
export function createInitialState(game, players) {
  const ids = players.map((player) => player.uid);
  return {
    ...newBase(players),
    turnUid: null,
    mode: game.options.mode,
    picks: {},
    scores: scoresFor(ids),
    target: game.options.target,
    round: 1,
    lastRound: null,
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
  return checkRpsRound(game, state, players, uid, action);
}

function checkRpsRound(game, state, players, uid, action) {
  const picks = { ...state.picks };
  if (Object.hasOwn(picks, uid)) throw new Error('Your choice is already locked in.');
  const choice = action.choice;
  const available = choicesForMode(state.mode);
  if (!available.includes(String(choice))) throw new Error('Choose one of the options on screen.');
  picks[uid] = String(choice);
  state.picks = picks;
  state.moves += 1;
  if (players.every((player) => Object.hasOwn(picks, player.uid))) {
    const scoreMap = { ...state.scores };
    let winners = [];
    if (state.mode === 'rps') {
      const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
      const points = Object.fromEntries(players.map((player) => [player.uid, 0]));
      for (const player of players) {
        for (const opponent of players) {
          if (player.uid !== opponent.uid && beats[picks[player.uid]] === picks[opponent.uid]) points[player.uid] += 1;
        }
      }
      const max = Math.max(...Object.values(points));
      if (max > 0) winners = players.filter((player) => points[player.uid] === max);
    } else if (state.mode === 'dice') {
      const max = Math.max(...players.map((player) => Number(picks[player.uid])));
      winners = players.filter((player) => Number(picks[player.uid]) === max);
    } else {
      // Two-sided coin, three callers: the flip is derived from the round so every client agrees.
      const result = hashNumber(`${game.id}:${state.round}:${players.map((player) => picks[player.uid]).join(':')}`) % 2 === 0 ? 'heads' : 'tails';
      winners = players.filter((player) => picks[player.uid] === result);
    }
    if (winners.length === 1) scoreMap[winners[0].uid] = (scoreMap[winners[0].uid] ?? 0) + 1;
    state.scores = scoreMap;
    state.lastRound = { picks, winnerUids: winners.map((player) => player.uid), round: state.round };
    state.picks = {};
    state.round += 1;
    if (Math.max(...Object.values(scoreMap)) >= state.target) finishByScore(state, players, scoreMap);
  }
  return state;
}
