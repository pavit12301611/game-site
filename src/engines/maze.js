/**
 * maze engine — simultaneous tile race: everyone moves at once, first to the star gate wins.
 * Games: Maze Runner, Neon Labyrinth, Byte Escape, Star Runner.
 *
 * The layout is a fixed, hand-drawn 7x7 wall set (indices into the flat board) so every player
 * sees exactly the same maze. `scores` counts steps taken, so the winner is also the shortest route.
 */

/** @typedef {import('../types.js').Game} Game */
/** @typedef {import('../types.js').Player} Player */
/** @typedef {import('../types.js').GameState} GameState */
/** @typedef {import('../types.js').Action} Action */

import { assertPlaying, newBase, scoresFor } from './shared.js';

export const MAZE_WALLS = [8, 9, 11, 15, 18, 22, 24, 25, 29, 32, 33, 37, 38];

const DIRECTIONS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/**
 * @param {Game} game
 * @param {Player[]} players
 * @returns {GameState}
 */
export function createInitialState(game, players) {
  const width = game.options.width;
  const height = game.options.height;
  const starts = players.map((_, index) => ({ x: index * 2, y: height - 1 }));
  return {
    ...newBase(players),
    turnUid: null,
    width,
    height,
    walls: [...MAZE_WALLS],
    positions: Object.fromEntries(players.map((player, index) => [player.uid, starts[index]])),
    goal: { x: width - 1, y: 0 },
    scores: scoresFor(players.map((player) => player.uid)),
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
  const delta = DIRECTIONS[action.direction];
  if (!delta) throw new Error('Choose a direction to move.');
  const position = state.positions[uid];
  const x = position.x + delta[0];
  const y = position.y + delta[1];
  const index = y * state.width + x;
  if (x < 0 || x >= state.width || y < 0 || y >= state.height || state.walls.includes(index)) {
    throw new Error('There is a wall in the way.');
  }
  state.positions[uid] = { x, y };
  state.scores[uid] = (state.scores[uid] ?? 0) + 1;
  state.moves += 1;
  if (x === state.goal.x && y === state.goal.y) {
    state.phase = 'finished';
    state.winnerUid = uid;
    state.result = 'winner';
  }
  return state;
}
