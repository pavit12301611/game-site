/**
 * The backend runtime shared by every way this project can be hosted:
 *
 *   - `functions/src/index.js` wraps it in Firebase callable Cloud Functions (needs the Blaze
 *     plan), and
 *   - `functions/src/http-backend.js` exposes exactly the same handlers over plain HTTPS, so the
 *     backend can run on hosts that have no Cloud Functions at all — this project's free
 *     deployment runs it as same-origin Vercel serverless functions in `api/`.
 *
 * Everything security-relevant is identical in both cases: the same handlers, the same Firestore
 * store adapter, the same error codes. Only the transport differs.
 */

import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';

import { GAMES } from '../vendor/shared/games.js';
import { onlineItemsForGame } from '../vendor/shared/content/quiz-banks.js';
import * as engineRegistry from '../vendor/src/engines/index.js';
import { createFirestoreStore } from './store.js';
import { PolicyError, RoomError, createHandlers } from './handlers.js';

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
 * One request's runtime: a fresh store (so `updatedAtMs` always comes from the clock, never the
 * payload) plus the handlers bound to it. Both hosting adapters build this per request.
 *
 * @param {{
 *   db: any,
 *   auth: { deleteUser: (uid: string) => Promise<void> },
 *   timestampMs?: number,
 *   now?: () => number,
 * }} deps
 */
export function createBackendRuntime({ db, auth, timestampMs = Date.now(), now = () => Date.now() }) {
  const store = createFirestoreStore(db, { now, toTimestamp: Timestamp.fromMillis });
  const handlers = createHandlers({
    store,
    games: GAMES,
    engines,
    onlineBankFor: onlineItemsForGame,
    randomId: shortId,
    timestampMs,
    deleteAuthUser: async (uid) => { await auth.deleteUser(uid); },
  });
  return { store, handlers };
}

/** Maps our error codes to the canonical status names both transports report to the browser. */
export const ERROR_STATUS = {
  unauthenticated: 'unauthenticated',
  'admin-only': 'permission-denied',
  blocked: 'permission-denied',
  'not-your-request': 'permission-denied',
  'not-your-invite': 'permission-denied',
  'self-remove': 'permission-denied',
  'rate-limited': 'resource-exhausted',
  'recent-login-required': 'failed-precondition',
  'last-admin': 'failed-precondition',
  'illegal-move': 'failed-precondition',
  'room-full': 'failed-precondition',
  'room-started': 'failed-precondition',
  'room-expired': 'failed-precondition',
  'chat-not-live': 'failed-precondition',
  'chat-empty': 'invalid-argument',
  'room-not-found': 'not-found',
  'user-not-found': 'not-found',
  'invite-missing': 'not-found',
  'request-missing': 'not-found',
  'profile-required': 'failed-precondition',
  'account-required': 'failed-precondition',
  'username-taken': 'already-exists',
  'already-friends': 'already-exists',
};

/**
 * The wire shape of a failed call, shared by both transports: the canonical status, a sentence
 * written for the player, and the backend's own policy code in `details` (which is how the browser
 * branches on `room-full`, `rate-limited`, …). Unexpected failures are logged by the caller and
 * reported as a vague `internal` on purpose — a stack trace never reaches the browser.
 *
 * @param {unknown} error
 * @param {{ log?: (error: unknown) => void }} [options]
 * @returns {{ status: string, message: string, details: Record<string, any> }}
 */
export function describeBackendError(error, { log = () => {} } = {}) {
  if (error instanceof RoomError || error instanceof PolicyError) {
    return {
      status: ERROR_STATUS[error.code] ?? 'failed-precondition',
      message: error.message,
      details: { code: error.code, ...error.details },
    };
  }
  log(error);
  return {
    status: 'internal',
    message: 'The online service hit an unexpected problem. Please try again.',
    details: { code: 'internal' },
  };
}
