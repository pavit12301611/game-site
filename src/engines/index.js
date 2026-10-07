/**
 * The engine registry: one entry per game.engine value in the catalog.
 *
 * createInitialState / applyAction take a game object and delegate to the right engine.
 * src/catalog.js wraps these with game-id resolution for the app layer.
 */

import { assertPlaying, copy } from './shared.js';

/** @typedef {import('../types.js').Game} Game */
/** @typedef {import('../types.js').Player} Player */
/** @typedef {import('../types.js').GameState} GameState */
/** @typedef {import('../types.js').Action} Action */

import * as battle from './battle.js';
import * as code from './code.js';
import * as drop from './drop.js';
import * as line from './line.js';
import * as maze from './maze.js';
import * as memory from './memory.js';
import * as quiz from './quiz.js';
import * as race from './race.js';
import * as rally from './rally.js';
import * as rps from './rps.js';

export const ENGINES = { line, drop, memory, race, rps, quiz, maze, battle, rally, code };

/** @returns {string[]} every engine id, in registry order. */
export function engineIds() {
  return Object.keys(ENGINES);
}

/** @param {string} engineId @returns {object | null} */
export function getEngine(engineId) {
  return ENGINES[engineId] ?? null;
}

export { assertPlaying, copy } from './shared.js';

/**
 * @param {Game} game
 * @param {Player[]} players
 * @param {string} [seed]
 * @param {object} [deps]
 * @returns {GameState}
 */
export function createInitialGameState(game, players, seed = 'psd', deps = undefined) {
  const engine = getEngine(game.engine);
  if (!engine) throw new Error(`The ${game.engine} game mode is not available.`);
  return engine.createInitialState(game, players, seed, deps);
}

/**
 * Applies one move to a copy of currentState and returns the next state.
 * @param {Game} game
 * @param {GameState} currentState
 * @param {string} uid
 * @param {Action} action
 * @param {Player[]} players
 * @returns {GameState}
 */
export function applyGameAction(game, currentState, uid, action, players) {
  const state = copy(currentState);
  assertPlaying(state);
  const engine = getEngine(game.engine);
  if (!engine) throw new Error('This game mode is not ready yet.');
  return engine.applyAction(game, state, uid, action, players);
}