/**
 * The trusted backend over plain HTTPS, for hosts that have no Cloud Functions.
 *
 * This project's free deployment runs the site on Vercel, and Vercel's Hobby (free) plan includes
 * serverless functions — so the same handlers `functions/src/index.js` exposes as Firebase
 * callables (which need the paid Blaze plan) are also served here, as same-origin API routes from
 * `api/`:
 *
 *   POST /api/backend/<name>   one route per callable, chosen by the last path segment
 *   GET  /api/cron/cleanup     the expiry sweep (Vercel's once-a-day cron, or any external
 *                              scheduler that presents CRON_SECRET — e.g. the free GitHub Actions
 *                              workflow in .github/workflows/cleanup.yml, which runs every 15 min)
 *
 * The contract deliberately mirrors what the callable SDK gives the browser, so
 * `src/online/callables.js` can treat both transports alike:
 *
 *   - the caller's identity comes from a Firebase ID token in `Authorization: Bearer …`, verified
 *     with the Admin SDK — the same check `onCall` performs via `request.auth`;
 *   - a failure answers `{ error: { status, message, details } }` with the canonical status name
 *     (`permission-denied`, `not-found`, …) and our policy code inside `details`.
 *
 * Everything is built from injectable dependencies, so `functions/test/http-backend.test.js` runs
 * the whole surface against the in-memory store and a fake token verifier — no emulator, no Java,
 * no network, exactly like the handler tests.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createBackendRuntime, describeBackendError } from './backend.js';
import { cleanupExpiredData } from './cleanup.js';

/** Every callable the HTTP route may dispatch to — exactly the set `functions/src/index.js` exports. */
export const HANDLER_NAMES = Object.freeze(new Set([
  'claimUsername',
  'lookupUser',
  'sendFriendRequest',
  'respondFriendRequest',
  'cancelFriendRequest',
  'createGameInvite',
  'respondGameInvite',
  'createRoom',
  'joinRoom',
  'leaveRoom',
  'startRoom',
  'claimHost',
  'playMove',
  'rematch',
  'sendChat',
  'blockUser',
  'unblockUser',
  'reportProblem',
  'createReview',
  'adminLabelReview',
  'adminTrainReviewAgent',
  'deleteAccount',
  'adminRoomAction',
  'adminRemovePlayer',
]));

/** Canonical status name → HTTP status. The names are the gRPC/HttpsError codes both transports use. */
const HTTP_STATUS = Object.freeze({
  'invalid-argument': 400,
  'failed-precondition': 412,
  unauthenticated: 401,
  'permission-denied': 403,
  'not-found': 404,
  'already-exists': 409,
  'resource-exhausted': 429,
  internal: 500,
  unavailable: 503,
});

/** @param {string} status */
function httpStatusOf(status) {
  return HTTP_STATUS[status] ?? 500;
}

/** The sentence for a caller who did not prove who they are — same words the handlers use. */
export const UNAUTHENTICATED_MESSAGE = 'Sign in (or continue as a guest) before using online features.';

/**
 * Builds the backend API. `deps` is the seam the tests use; production calls {@link backendApi}.
 *
 * @param {{
 *   createRuntime: (timestampMs: number) => { store: any, handlers: Record<string, Function> },
 *   verifyToken: (token: string) => Promise<any>,
 *   cronSecret: () => string,
 *   now?: () => number,
 *   log?: (error: unknown) => void,
 * }} deps
 */
export function createHttpBackend(deps) {
  const { createRuntime, verifyToken, cronSecret, now = () => Date.now(), log = console.error } = deps;

  /** @param {string} authorization */
  async function verifiedCaller(authorization) {
    const token = String(authorization || '').replace(/^Bearer\s+/i, '').trim();
    // A Firebase ID token is a three-part JWT; anything else is refused before it costs a
    // signature check, so garbage traffic cannot turn into Admin SDK work.
    if (!token || token.split('.').length !== 3) return null;
    try {
      const decoded = await verifyToken(token);
      return decoded?.uid ? { uid: String(decoded.uid), token: decoded } : null;
    } catch {
      return null;
    }
  }

  /**
   * One callable over HTTP.
   * @param {{ name?: string, method?: string, authorization?: string, body?: any }} request
   * @returns {Promise<{ status: number, json: Record<string, any> }>}
   */
  async function handleCall({ name, method = 'POST', authorization = '', body = null }) {
    const cleanName = String(name || '').trim();
    if (method !== 'POST') {
      return { status: 405, json: { error: { status: 'failed-precondition', message: 'The backend only accepts POST requests.', details: { code: 'method-not-allowed' } } } };
    }
    if (!HANDLER_NAMES.has(cleanName)) {
      return { status: 404, json: { error: { status: 'not-found', message: `Unknown backend function ${cleanName || '(none)'}.`, details: { code: 'unknown-handler' } } } };
    }
    let caller;
    try {
      caller = await verifiedCaller(authorization);
    } catch (error) {
      log(error);
      return { status: 500, json: { error: { status: 'internal', message: 'The online service hit an unexpected problem. Please try again.', details: { code: 'internal' } } } };
    }
    if (!caller) {
      return { status: 401, json: { error: { status: 'unauthenticated', message: UNAUTHENTICATED_MESSAGE, details: { code: 'unauthenticated' } } } };
    }
    const payload = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    try {
      const { handlers } = createRuntime(now());
      const result = await handlers[cleanName](payload, caller);
      return { status: 200, json: { result: result ?? {} } };
    } catch (error) {
      const described = describeBackendError(error, { log });
      return { status: httpStatusOf(described.status), json: { error: described } };
    }
  }

  /**
   * The expiry sweep. The secret keeps the endpoint from becoming a quota drain: Vercel's cron
   * sends `Authorization: Bearer $CRON_SECRET` automatically once the variable exists.
   * @param {{ authorization?: string }} request
   */
  async function handleCleanup({ authorization = '' } = {}) {
    const secret = String(cronSecret() || '');
    if (!secret) {
      return { status: 503, json: { error: { status: 'failed-precondition', message: 'The cleanup endpoint is disabled until CRON_SECRET is set on the backend host.', details: { code: 'cleanup-unconfigured' } } } };
    }
    const presented = String(authorization).replace(/^Bearer\s+/i, '');
    // Hash both sides so a length difference in the digests can never leak through timingSafeEqual.
    const given = createHash('sha256').update(presented).digest();
    const expected = createHash('sha256').update(secret).digest();
    if (!timingSafeEqual(given, expected)) {
      return { status: 401, json: { error: { status: 'unauthenticated', message: 'That is not the cleanup secret.', details: { code: 'bad-cron-secret' } } } };
    }
    try {
      const { store } = createRuntime(now());
      const summary = await cleanupExpiredData({ store, nowMs: now() });
      if (summary.errors?.length) {
        log(summary.errors);
        return { status: 500, json: { error: { status: 'internal', message: 'The cleanup run finished, but some steps failed. The next run continues where this one stopped.', details: { code: 'cleanup-partial', summary } } } };
      }
      return { status: 200, json: { result: summary } };
    } catch (error) {
      log(error);
      return { status: 500, json: { error: { status: 'internal', message: 'The cleanup run failed. The next run continues where this one stopped.', details: { code: 'cleanup-failed' } } } };
    }
  }

  return { handleCall, handleCleanup };
}

/** Thrown when the hosting environment has no service-account credentials to run the backend with. */
export class BackendConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BackendConfigError';
  }
}

/**
 * Writes one JSON answer with the plain Node response API (`statusCode` + `setHeader` + `end`).
 * Vercel's Node runtime supports it alongside its Express-like helpers, and it also works under a
 * raw node:http server — which is how the route adapters are exercised outside Vercel.
 * @param {any} res @param {number} status @param {Record<string, any>} json
 */
export function sendJson(res, status, json) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(json));
}

/**
 * Reads the service-account key the host was given. On Vercel that is one environment variable,
 * `FIREBASE_SERVICE_ACCOUNT`, holding either the raw JSON or the same JSON base64-encoded (some
 * teams prefer base64 so stray newlines cannot corrupt it). Never a file, never in the repository.
 * @param {string | undefined} raw
 */
export function parseServiceAccount(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const jsonText = text.startsWith('{') ? text : Buffer.from(text, 'base64').toString('utf8');
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new BackendConfigError('FIREBASE_SERVICE_ACCOUNT is set, but it is neither valid JSON nor valid base64-of-JSON. Paste the whole service-account key file as one value.');
  }
  if (!parsed?.project_id || !parsed?.private_key || !parsed?.client_email) {
    throw new BackendConfigError('FIREBASE_SERVICE_ACCOUNT is missing project_id, private_key or client_email. Regenerate the key (Firebase Console → Project settings → Service accounts → Generate new private key) and paste the whole file.');
  }
  return parsed;
}

/**
 * The production backend: one Admin SDK app, created once and kept on `globalThis` so warm
 * serverless invocations reuse it instead of re-reading credentials on every request.
 * `GOOGLE_APPLICATION_CREDENTIALS`-style defaults still work when the variable is absent (useful
 * with the Firebase emulator), and both `FIREBASE_AUTH_EMULATOR_HOST` and `FIRESTORE_EMULATOR_HOST`
 * are honoured by the Admin SDK itself.
 */
export function backendApi() {
  const cache = /** @type {any} */ (globalThis);
  if (!cache.__psdBackendApi) {
    try {
      cache.__psdBackendApi = buildProductionBackend();
    } catch (error) {
      if (!(error instanceof BackendConfigError)) throw error;
      // A host without credentials must still answer every route with the exact fix, not with a
      // crashed function the browser can only show as a network failure.
      const response = { status: 500, json: { error: { status: 'internal', message: error.message, details: { code: 'backend-unconfigured' } } } };
      cache.__psdBackendApi = { handleCall: async () => response, handleCleanup: async () => response };
    }
  }
  return cache.__psdBackendApi;
}

/** @returns {ReturnType<typeof createHttpBackend>} */
function buildProductionBackend() {
  const serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!serviceAccount && !getApps().length && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new BackendConfigError('The backend is not configured: set FIREBASE_SERVICE_ACCOUNT on the host (Vercel → Settings → Environment Variables) to the service-account key JSON, then redeploy. Local practice in the game library keeps working without it.');
  }
  const app = getApps()[0] ?? initializeApp(serviceAccount
    ? { credential: cert(serviceAccount), projectId: serviceAccount.project_id }
    : undefined);
  const auth = getAuth(app);
  const db = getFirestore(app);
  return createHttpBackend({
    createRuntime: (timestampMs) => createBackendRuntime({ db, auth, timestampMs }),
    verifyToken: (token) => auth.verifyIdToken(token),
    cronSecret: () => process.env.CRON_SECRET || '',
  });
}
