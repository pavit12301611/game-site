/**
 * The shared wiring behind every Vercel serverless route in this folder.
 *
 * These routes are the replacement for the Firebase Cloud Functions that used to live in
 * `functions/src/index.js`. Nothing here trusts the browser: the Firestore rules still deny every
 * client write to rooms, profiles, usernames, requests, invites, friendships, blocks and reports,
 * so these functions — running the *same* handlers from `functions/src/handlers.js` through the
 * Admin SDK — are the only writers of online state.
 *
 * The shape mirrors the old `callableFor(name)` wrapper with one difference that matters on Vercel:
 * a Firebase callable receives the caller's uid from `request.auth` for free, while an HTTP function
 * has to earn it. So every route:
 *
 *   1. reads the `Authorization: Bearer <idToken>` header the browser attaches,
 *   2. verifies it with the Admin SDK (`verifyIdToken`) to recover the uid,
 *   3. builds a Firestore store + the handlers and dispatches to the named handler,
 *   4. turns a `PolicyError`/`RoomError` into an HTTP status plus a JSON body that carries our own
 *      `code`, so the browser can show the same sentence it always did.
 *
 * `functions/src/backend.js` holds the handler binding so this file stays about HTTP concerns only.
 *
 * Deployment note: on Vercel there are no Application Default Credentials, so the Admin SDK needs a
 * service account. Set `FIREBASE_SERVICE_ACCOUNT` (the JSON, as one line) in the Vercel environment;
 * without it the SDK falls back to default credentials, which only work on Google Cloud.
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

import { createFirestoreStore } from '../functions/src/store.js';
import { makeHandlers } from '../functions/src/backend.js';
import { cleanupExpiredData } from '../functions/src/cleanup.js';
import { PolicyError, RoomError } from '../functions/src/handlers.js';

/** Maps our error codes to the HTTP status the browser sees (mirrors functions/src/index.js). */
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

/** The HTTP status codes those Firebase-style statuses stand for. */
const STATUS_NUMBER = {
  ok: 200,
  unauthenticated: 401,
  'permission-denied': 403,
  'not-found': 404,
  'already-exists': 409,
  'resource-exhausted': 429,
  'failed-precondition': 400,
  'invalid-argument': 400,
  internal: 500,
  unknown: 500,
};

/** @param {string} code @returns {string} the Firebase-style status for one of our codes. */
function statusForCode(code) {
  return HTTPS_CODE[code] ?? 'failed-precondition';
}

/** @param {string} status @returns {number} the HTTP number for a Firebase-style status. */
function statusNumber(status) {
  return STATUS_NUMBER[status] ?? 500;
}

/** The single Admin app, created lazily and reused across warm invocations. */
let cachedApp;
function adminApp() {
  if (cachedApp) return cachedApp;
  if (getApps().length) {
    cachedApp = getApps()[0];
    return cachedApp;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (raw) {
    try {
      cachedApp = initializeApp({ credential: cert(JSON.parse(raw)) });
      return cachedApp;
    } catch (error) {
      console.error('[psd-gaming] FIREBASE_SERVICE_ACCOUNT is not valid JSON; using default credentials', error);
    }
  }
  cachedApp = initializeApp();
  return cachedApp;
}

/** @returns {import('firebase-admin/firestore').Firestore} */
function firestore() {
  return getFirestore(adminApp());
}

/** @returns {import('firebase-admin/auth').Auth} */
function adminAuth() {
  return getAuth(adminApp());
}

/**
 * Recovers the caller's uid from the `Authorization: Bearer <idToken>` header.
 * A missing header yields an empty uid (the handler then decides whether that is allowed); a
 * present-but-invalid token is a hard 401.
 * @param {any} req
 * @returns {Promise<{ uid: string, token: Record<string, any> }>}
 */
async function authFromRequest(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(header));
  if (!match) return { uid: '', token: {} };
  const decoded = await adminAuth().verifyIdToken(match[1]);
  return { uid: decoded.uid, token: decoded };
}

/** Reads and parses the JSON body, tolerating Vercel's already-parsed object and a raw string. */
function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) return JSON.parse(req.body);
  return {};
}

/** Builds a Firestore store + the handlers for one request. */
function backend() {
  const store = createFirestoreStore(firestore(), {
    now: () => Date.now(),
    toTimestamp: (ms) => Timestamp.fromMillis(ms),
  });
  const handlers = makeHandlers(store, {
    timestampMs: Date.now(),
    deleteAuthUser: async (uid) => { await adminAuth().deleteUser(uid); },
  });
  return handlers;
}

/**
 * Runs one named handler as a Vercel route. Every `api/<name>.js` file is a one-line wrapper around
 * this, exactly like the old `callableFor(name)` exported the Firebase callables.
 * @param {string} name
 * @param {any} req
 * @param {any} res
 */
export async function handleCallable(name, req, res) {
  if (req.method && req.method.toUpperCase() !== 'POST') {
    res.status(405).json({ code: 'method-not-allowed', message: 'Use POST for this endpoint.' });
    return;
  }

  let body;
  try {
    body = readBody(req);
  } catch {
    res.status(400).json({ code: 'invalid-json', message: 'The request body was not valid JSON.' });
    return;
  }

  let uid = '';
  let token = {};
  try {
    ({ uid, token } = await authFromRequest(req));
  } catch {
    res.status(401).json({
      code: 'unauthenticated',
      message: 'Sign in (or continue as a guest) before using online features.',
    });
    return;
  }

  try {
    const handlers = backend();
    const handler = handlers[name];
    if (typeof handler !== 'function') {
      res.status(500).json({ code: 'unknown-handler', message: `Unknown handler ${name}.` });
      return;
    }
    const payload = await handler(body ?? {}, { uid, token });
    res.status(200).json(payload ?? {});
  } catch (error) {
    // A PolicyError/RoomError is an answer the player is meant to see, so it is not a fault worth a
    // stack trace in the logs; anything else is unexpected and gets one, exactly like the old
    // `toHttpsError` in functions/src/index.js.
    if (!(error instanceof PolicyError || error instanceof RoomError)) {
      console.error(`[psd-gaming] ${name} failed unexpectedly`, error);
    }
    const code = String(error?.code || 'internal');
    const details = error && typeof error.details === 'object' ? error.details : {};
    const retryAfterMs = Number(details.retryAfterMs) || 0;
    res.status(statusNumber(statusForCode(code))).json({
      code,
      message: error?.message || 'The online service hit an unexpected problem. Please try again.',
      ...details,
      ...(retryAfterMs ? { retryAfterMs } : {}),
    });
  }
}

/**
 * The scheduled data cleanup (the old `cleanupExpired` Cloud Scheduler function). Idempotent by
 * construction, so a Vercel Cron hit and a manual trigger are equally safe. When `CRON_SECRET` is
 * set the route is locked to callers that present it (via `Authorization: Bearer` or `?secret=`);
 * leave it unset to let Vercel Cron call `/api/cleanup` directly.
 * @param {any} req
 * @param {any} res
 */
export async function handleCleanup(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = String(req.headers?.authorization || '');
    const query = String(req.query?.secret || '');
    const ok = header === `Bearer ${secret}` || query === secret;
    if (!ok) {
      res.status(401).json({ code: 'unauthenticated', message: 'A valid cron secret is required.' });
      return;
    }
  }
  try {
    const store = createFirestoreStore(firestore(), {
      now: () => Date.now(),
      toTimestamp: (ms) => Timestamp.fromMillis(ms),
    });
    const summary = await cleanupExpiredData({ store, nowMs: Date.now() });
    res.status(200).json(summary);
  } catch (error) {
    console.error('[psd-gaming] cleanup failed', error);
    res.status(500).json({ code: 'internal', message: 'The cleanup run hit an unexpected problem.' });
  }
}
