/**
 * battle engine — turn-based fleet hunt. Each player fires at one rival board per turn and wins by
 * sinking every rival's fleet first. Shots are keyed `targetUid:index` per shooter.
 * Games: Sea Battle, Pixel Fleet, Alien Skirmish.
 */

/** @typedef {import('../types.js').Game} Game */
/** @typedef {import('../types.js').Player} Player */
/** @typedef {import('../types.js').GameState} GameState */
/** @typedef {import('../types.js').Action} Action */

import { advanceTurn, assertPlaying, assertTurn, makeRandom, newBase } from './shared.js';

/**
 * @param {Game} game
 * @param {Player[]} players
 * @param {string} [seed]
 * @returns {GameState}
 */
export function createInitialState(game, players, seed) {
  const boardSize = game.options.board;
  const random = makeRandom(`${seed}:${game.id}:fleet`);
  const ships = {};
  for (const player of players) {
    const positions = new Set();
    while (positions.size < game.options.fleet) positions.add(Math.floor(random() * boardSize * boardSize));
    ships[player.uid] = [...positions];
  }
  return {
    ...newBase(players),
    boardSize,
    ships,
    shots: Object.fromEntries(players.map((player) => [player.uid, []])),
    lastShot: null,
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
  const targetUid = String(action.targetUid ?? '');
  const index = Number(action.index);
  if (!players.some((player) => player.uid === targetUid) || targetUid === uid) throw new Error('Choose another player’s board.');
  if (!Number.isInteger(index) || index < 0 || index >= state.boardSize * state.boardSize) throw new Error('Choose a square on the board.');
  const key = `${targetUid}:${index}`;
  if (state.shots[uid].includes(key)) throw new Error('You have already fired at that square.');
  state.shots[uid] = [...state.shots[uid], key];
  const hit = state.ships[targetUid].includes(index);
  state.lastShot = { shooterUid: uid, targetUid, index, hit };
  state.moves += 1;
  const allSunk = players.filter((player) => player.uid !== uid).every((opponent) =>
    state.ships[opponent.uid].every((shipIndex) => state.shots[uid].includes(`${opponent.uid}:${shipIndex}`))
  );
  if (allSunk) {
    state.phase = 'finished';
    state.winnerUid = uid;
    state.result = 'winner';
  } else {
    advanceTurn(state, players, uid);
  }
  return state;
}
