/**
 * The Firebase callable hosting of the PSD-gaming backend: the callable functions the browser is
 * allowed to use, plus the scheduled data cleanup.
 *
 * Deployment shape (see docs/online-play.md and the README):
 *
 *   firebase deploy --only functions      # runs `node scripts/sync-shared.mjs` as a predeploy hook
 *   firebase emulators:start --only functions,firestore,auth
 *
 * This transport needs the Blaze plan (Cloud Functions + Cloud Scheduler). The default deployment
 * of this project does NOT use it: `functions/src/http-backend.js` exposes the same handlers over
 * plain HTTPS, hosted as same-origin Vercel serverless functions from `api/`, which runs on the
 * free tier. Set `VITE_BACKEND_URL=firebase` in the site's build to point the browser here instead.
 *
 * Nothing here trusts the browser. The Firestore rules deny every client write to rooms, profiles,
 * usernames, requests, invites, friendships, blocks and reports, so these functions are the only
 * writers of online state. The Admin SDK bypasses those rules, which is exactly why all validation
 * lives in ./handlers.js and in the shared room transitions.
 */

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';

import { createBackendRuntime, describeBackendError, engines } from './backend.js';
import { createFirestoreStore } from './store.js';
import { cleanupExpiredData } from './cleanup.js';

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const app = initializeApp();
const db = getFirestore(app);
const auth = getAuth(app);

export { engines };

/**
 * Wraps one handler as a callable. Request authentication comes from Firebase itself
 * (`request.auth`), and every failure is converted to an `HttpsError` that carries our own error
 * code in `details`, so the browser can turn it into a precise sentence.
 * @param {string} name
 */
export function callableFor(name) {
  return onCall(async (request) => {
    const { handlers } = createBackendRuntime({ db, auth, timestampMs: Date.now() });
    const handler = handlers[name];
    if (typeof handler !== 'function') throw new HttpsError('internal', `Unknown handler ${name}`, { code: 'unknown-handler' });
    try {
      return await handler(request.data ?? {}, request.auth ?? { uid: '' });
    } catch (error) {
      const described = describeBackendError(error, { log: (cause) => logger.error('[psd-gaming] unexpected backend failure', cause) });
      throw new HttpsError(described.status, described.message, described.details);
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
export const sendChat = callableFor('sendChat');
export const blockUser = callableFor('blockUser');
export const unblockUser = callableFor('unblockUser');
export const reportProblem = callableFor('reportProblem');
export const createReview = callableFor('createReview');
export const adminLabelReview = callableFor('adminLabelReview');
export const adminTrainReviewAgent = callableFor('adminTrainReviewAgent');
export const deleteAccount = callableFor('deleteAccount');
export const adminRoomAction = callableFor('adminRoomAction');
export const adminRemovePlayer = callableFor('adminRemovePlayer');

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
 * store adapter adds it), so an operator can enable a native Firestore TTL policy on
 * `expiresAtDate` as a second, independent expiry mechanism — on the Blaze plan only, because
 * Firestore TTL itself requires billing:
 * Firebase Console → Firestore Database → Time-to-live → add `expiresAtDate`.
 */
export const TTL_FIELD = 'expiresAtDate';
