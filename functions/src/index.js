/**
 * The PSD-gaming backend entry point: the callable functions the browser is allowed to use, plus the
 * scheduled data cleanup.
 *
 * Deployment shape (see docs/online-play.md and the README):
 *
 *   firebase deploy --only functions      # runs `node scripts/sync-shared.mjs` as a predeploy hook
 *   firebase emulators:start --only functions,firestore,auth
 *
 * Nothing here trusts the browser. The Firestore rules deny every client write to rooms, profiles,
 * usernames, requests, invites, friendships, blocks, reports and maintenance state, so these
 * functions are the only writers of online state. The Admin SDK bypasses those rules, which is exactly why all validation
 * lives in ./handlers.js and in the shared room transitions.
 */

import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';

import { GAMES } from '../vendor/shared/games.js';
import { onlineItemsForGame } from '../vendor/shared/content/quiz-banks.js';
import * as engineRegistry from '../vendor/src/engines/index.js';
import { createFirestoreStore } from './store.js';
import { PolicyError, RoomError, createHandlers } from './handlers.js';
import { cleanupExpiredData } from './cleanup.js';

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const app = initializeApp();
const db = getFirestore(app);
const auth = getAuth(app);

/** A short, URL-safe id used for room ids and report ids. */
function shortId(length = 20) {
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

/** @param {ReturnType<typeof createFirestoreStore>} store */
function makeHandlers(store, { timestampMs = Date.now() } = {}) {
  return createHandlers({
    store,
    games: GAMES,
    engines,
    onlineBankFor: onlineItemsForGame,
    randomId: shortId,
    timestampMs,
    deleteAuthUser: async (uid) => { await auth.deleteUser(uid); },
  });
}

/** Maps our error codes to the HTTP status the browser sees. */
const HTTPS_CODE = {
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
  'room-not-found': 'not-found',
  'user-not-found': 'not-found',
  'invite-missing': 'not-found',
  'request-missing': 'not-found',
  'profile-required': 'failed-precondition',
  'account-required': 'failed-precondition',
  'username-taken': 'already-exists',
  'already-friends': 'already-exists',
  'invalid-pin': 'permission-denied',
  'maintenance-not-active': 'failed-precondition',
};

/** @param {unknown} error */
function toHttpsError(error) {
  if (error instanceof RoomError || error instanceof PolicyError) {
    const status = HTTPS_CODE[error.code] ?? 'failed-precondition';
    return new HttpsError(status, error.message, { code: error.code, ...error.details });
  }
  logger.error('[psd-gaming] unexpected backend failure', error);
  return new HttpsError('internal', 'The online service hit an unexpected problem. Please try again.', { code: 'internal' });
}

/**
 * Wraps one handler as a callable. Request authentication comes from Firebase itself
 * (`request.auth`), and every failure is converted to an `HttpsError` that carries our own error
 * code in `details`, so the browser can turn it into a precise sentence.
 * @param {string} name
 */
export function callableFor(name) {
  return onCall(async (request) => {
    const store = createFirestoreStore(db, { now: () => Date.now() });
    const handler = makeHandlers(store)[name];
    if (typeof handler !== 'function') throw new HttpsError('internal', `Unknown handler ${name}`, { code: 'unknown-handler' });
    try {
      return await handler(request.data ?? {}, request.auth ?? { uid: '' });
    } catch (error) {
      throw toHttpsError(error);
    }
  });
}

export const claimUsername = callableFor('claimUsername');
export const lookupUser = callableFor('lookupUser');
export const sendFriendRequest = callableFor('sendFriendRequest');
export const respondFriendRequest = callableFor('respondFriendRequest');
export const cancelFriendRequest = callableFor('cancelFriendRequest');
export const createGameInvite = callableFor('createGameInvite');
export const respondGameInvite = callableFor('respondGameInvite');
export const createRoom = callableFor('createRoom');
export const joinRoom = callableFor('joinRoom');
export const leaveRoom = callableFor('leaveRoom');
export const startRoom = callableFor('startRoom');
export const claimHost = callableFor('claimHost');
export const playMove = callableFor('playMove');
export const rematch = callableFor('rematch');
export const blockUser = callableFor('blockUser');
export const unblockUser = callableFor('unblockUser');
export const reportProblem = callableFor('reportProblem');
export const createReview = callableFor('createReview');
export const adminLabelReview = callableFor('adminLabelReview');
export const adminTrainReviewAgent = callableFor('adminTrainReviewAgent');
export const deleteAccount = callableFor('deleteAccount');
export const adminRoomAction = callableFor('adminRoomAction');
export const adminRemovePlayer = callableFor('adminRemovePlayer');
/** Maintenance mode: the admin switch, and the PIN an invited tester types in. */
export const adminSetMaintenance = callableFor('adminSetMaintenance');
export const redeemMaintenancePin = callableFor('redeemMaintenancePin');

/**
 * Global cleanup. Runs every 15 minutes; a retry after a timeout continues where the last run
 * stopped, because every step is a delete that treats "already gone" as success.
 */
export const cleanupExpired = onSchedule('every 15 minutes', async () => {
  const store = createFirestoreStore(db, { now: () => Date.now() });
  const summary = await cleanupExpiredData({ store, nowMs: Date.now() });
  logger.info('[psd-gaming] cleanup finished', summary);
  return summary;
});

/**
 * Room documents carry an `expiresAtDate` Firestore timestamp next to the numeric `expiresAt` (the
 * store adapter adds it), so the operator can enable a native Firestore TTL policy on
 * `expiresAtDate` as a second, independent expiry mechanism:
 * Firebase Console → Firestore Database → Time-to-live → add `expiresAtDate`.
 */
export const TTL_FIELD = 'expiresAtDate';
