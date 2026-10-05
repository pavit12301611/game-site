/**
 * The engine registry: one entry per `game.engine` value in the catalog.
 *
 * `createInitialGameState` / `applyGameAction` here take a **game object**. The same names in
 * src/catalog.js are the app-facing wrappers that also accept a game id; that split keeps the
 * engines free of any dependency on the catalog (no import cycle) and lets each engine be tested
 * on its own.
 */
import { assertPlaying, copy } from './shared.js';

/** @typedef {import('../types.js').Game} Game */
/** @typedef {import('../types.js').Player} Player */
/** @typedef {import('../types.js').GameState} GameState */
/** @typedef {import('../types.js').Action} Action */
/** @typedef {import('../types.js').Engine} Engine */
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

/** @param {string} engineId @returns {Engine | null} */
export function getEngine(engineId) {
  return ENGINES[engineId] ?? null;
}

export { assertPlaying, copy } from './shared.js';

/**
 * @param {Game} game
 * @param {Player[]} players
 * @param {string} [seed]
 * @returns {GameState} a fresh, Firestore-safe game state
 */
export function createInitialGameState(game, players, seed = 'psd', deps = undefined) {
  const engine = getEngine(game.engine);
  if (!engine) throw new Error(`The ${game.engine} game mode is not available.`);
  // `deps` is forwarded so the trusted backend can deal from a bank the browser never receives
  // (quiz). Engines that have no use for it simply ignore the extra argument.
  return engine.createInitialState(game, players, seed, deps);
}

/**
 * Applies one move to a copy of `currentState` and returns the next state.
 * @param {Game} game
 * @param {GameState} currentState
 * @param {string} uid
 * @param {Action} action
 * @param {Player[]} players
 * @returns {GameState}
 * @throws {Error} with a player-facing message when the move is illegal.
 */
export function applyGameAction(game, currentState, uid, action, players) {
  const state = copy(currentState);
  assertPlaying(state);
  const engine = getEngine(game.engine);
  if (!engine) throw new Error('This game mode is not ready yet.');
  return engine.applyAction(game, state, uid, action, players);
}
