/**
 * The backend wiring shared by every deployment target.
 *
 * The handlers in ./handlers.js are pure functions of (payload, auth context, store) and know
 * nothing about HTTP, Firebase callables or Vercel. This module binds them to the real
 * dependencies — the game catalog, the engine registry (with the online quiz banks), a clock and a
 * short-id generator — in exactly one place, so the Firebase entry point (functions/src/index.js)
 * and the Vercel serverless routes (api/) run byte-for-byte identical logic.
 *
 * The `store` is always passed in (never created here): the caller decides which Firestore instance
 * it talks to, which is also what keeps ./handlers.js unit-testable without the Admin SDK.
 */

import { randomUUID } from 'node:crypto';

import { GAMES } from '../vendor/shared/games.js';
import { onlineItemsForGame } from '../vendor/shared/content/quiz-banks.js';
import * as engineRegistry from '../vendor/src/engines/index.js';

import { createHandlers } from './handlers.js';

/** A short, URL-safe id used for room ids and report ids. */
export function shortId(length = 20) {
  return randomUUID().replace(/-/g, '').slice(0, length);
}

/**
 * The engine registry the backend validates with — the *same* modules the browser runs, with one
 * crucial difference for quiz games: online rooms are dealt from the full bank minus the warm-up
 * items that ship to the browser, so an online answer is never present in a player's bundle.
 */
export const engines = {
  createInitialGameState: (game, players, seed) => engineRegistry.createInitialGameState(
    game,
    players,
    seed,
    game.engine === 'quiz' ? { bank: onlineItemsForGame(game.id) } : undefined,
  ),
  applyGameAction: engineRegistry.applyGameAction,
  engineIds: engineRegistry.engineIds,
};

/**
 * Builds every handler bound to the production dependencies.
 * @param {import('./store.js').Store} store
 * @param {{ timestampMs?: number, deleteAuthUser?: (uid: string) => Promise<void> }} [options]
 */
export function makeHandlers(store, { timestampMs = Date.now(), deleteAuthUser } = {}) {
  return createHandlers({
    store,
    games: GAMES,
    engines,
    onlineBankFor: onlineItemsForGame,
    randomId: shortId,
    timestampMs,
    deleteAuthUser,
  });
}
