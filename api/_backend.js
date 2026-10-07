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
 * Deployment note: on Vercel there are no Application Default Credentials, so the Admin SDK needs
 * credentials one of three ways — set `FIREBASE_SERVICE_ACCOUNT` (a service-account JSON on one line),
 * or go **keyless** with Workload Identity Federation by setting `FIREBASE_WIF_AUDIENCE`,
 * `FIREBASE_WIF_SERVICE_ACCOUNT` and `FIREBASE_PROJECT_ID` (see `resolveBackend` below and the
 * "Keyless deploy" section of docs/online-play.md), or fall back to Application Default Credentials.
 * The service-account route is blocked when an org policy forbids key creation, which is exactly when
 * WIF is the answer.
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { ExternalAccountClient } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/oidc';
import { Firestore, Timestamp } from '@google-cloud/firestore';

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
  // extra mappings for codes that previously fell through to the generic 400
  'unknown-game': 'invalid-argument',
  'bad-room-size': 'invalid-argument',
  'invalid-username': 'invalid-argument',
  'invalid-review-rating': 'invalid-argument',
  'invalid-review-game': 'invalid-argument',
  'review-too-short': 'invalid-argument',
  'invalid-review-label': 'invalid-argument',
  'review-agent-needs-labels': 'failed-precondition',
  'invalid-request': 'invalid-argument',
  'request-handled': 'failed-precondition',
  'profile-missing': 'failed-precondition',
  'profile-exists': 'already-exists',
  'self-request': 'failed-precondition',
  'not-friends': 'failed-precondition',
  'host-only': 'failed-precondition',
  'already-in-room': 'failed-precondition',
  'not-in-room': 'failed-precondition',
  'room-finished': 'failed-precondition',
  'already-started': 'failed-precondition',
  'needs-players': 'failed-precondition',
  'not-playing': 'failed-precondition',
  'not-finished': 'failed-precondition',
  'host-still-here': 'failed-precondition',
  'unknown-admin-action': 'invalid-argument',
  'missing-uid': 'invalid-argument',
  'invalid-block': 'invalid-argument',
  'report-too-short': 'invalid-argument',
  'state-too-large': 'resource-exhausted',
  'confirm-required': 'failed-precondition',
  'method-not-allowed': 'invalid-argument',
  'invalid-json': 'invalid-argument',
  'unknown-handler': 'invalid-argument',
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

/** Default OAuth scopes: cloud-platform is the umbrella that covers Firestore, Auth and IAM. */
const WIF_DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/identitytoolkit',
  'https://www.googleapis.com/auth/firebase',
];

/**
 * Resolves the Firestore `db` and the Auth client the routes use, once per warm instance.
 *
 * Three ways to authenticate, tried in order:
 *
 *   1. **`FIREBASE_SERVICE_ACCOUNT`** — a service-account JSON key. Simplest, but blocked when an org
 *      policy forbids key creation.
 *   2. **Workload Identity Federation (keyless)** — `FIREBASE_WIF_AUDIENCE`, `FIREBASE_WIF_SERVICE_ACCOUNT`
 *      and `FIREBASE_PROJECT_ID`. Vercel signs a short-lived OIDC token for each invocation
 *      (`getVercelOidcToken`); we hand it to google-auth-library's `ExternalAccountClient`, which
 *      exchanges it at Google's STS endpoint and impersonates the Admin SDK service account. No key
 *      file anywhere.
 *   3. **Application Default Credentials** — `initializeApp()`; works on Google Cloud runtimes.
 *
 * Firestore note: firebase-admin's `getFirestore()` refuses a custom credential (it only accepts a
 * service-account key or ADC), so under WIF we build Firestore directly from `@google-cloud/firestore`
 * and hand it the auth client (`new Firestore({ projectId, authClient })`). firebase-admin is still
 * used for Auth, whose generic credential path only needs `getAccessToken()`.
 *
 * @returns {{ db: import('@google-cloud/firestore').Firestore, auth: import('firebase-admin/auth').Auth }}
 */
function resolveBackend() {
  if (cachedBackend) return cachedBackend;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (raw) {
    try {
      const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(JSON.parse(raw)) });
      cachedBackend = { db: getFirestore(app), auth: getAuth(app) };
      return cachedBackend;
    } catch (error) {
      console.error('[psd-gaming] FIREBASE_SERVICE_ACCOUNT is not valid JSON; trying Workload Identity Federation', error);
    }
  }

  if (process.env.FIREBASE_WIF_AUDIENCE) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const serviceAccount = process.env.FIREBASE_WIF_SERVICE_ACCOUNT;
    if (!projectId || !serviceAccount) {
      throw new Error(
        'Workload Identity Federation needs FIREBASE_WIF_AUDIENCE, FIREBASE_WIF_SERVICE_ACCOUNT and FIREBASE_PROJECT_ID.',
      );
    }
    const scopes = process.env.FIREBASE_WIF_SCOPES
      ? process.env.FIREBASE_WIF_SCOPES.split(',').map((scope) => scope.trim()).filter(Boolean)
      : WIF_DEFAULT_SCOPES;

    const authClient = ExternalAccountClient.fromJSON({
      type: 'external_account',
      audience: process.env.FIREBASE_WIF_AUDIENCE,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      token_url: 'https://sts.googleapis.com/v1/token',
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`,
      subject_token_supplier: {
        getSubjectToken: async () => {
          try {
            return await getVercelOidcToken();
          } catch (error) {
            throw new Error(
              'Could not read the Vercel OIDC token. Is OIDC federation enabled for this project, and is this running on Vercel?',
              { cause: error },
            );
          }
        },
      },
    });
    // Pin the umbrella scope explicitly: google-auth-library's getScopesArray() reads `scopes`, not
    // `defaultScopes`, so this wins over the datastore scope @google-cloud/firestore would otherwise
    // set — and cloud-platform authorizes both Firestore and Auth with one impersonated token.
    authClient.scopes = scopes;

    const db = new Firestore({ projectId, authClient });
    const app = getApps().length ? getApps()[0] : initializeApp({
      projectId,
      credential: {
        getAccessToken: async () => {
          const { token } = await authClient.getAccessToken();
          if (!token) throw new Error('Workload Identity Federation returned no access token.');
          // A conservative TTL keeps firebase-admin refreshing; the client caches the real token.
          return { access_token: token, expires_in: 300 };
        },
      },
    });
    cachedBackend = { db, auth: getAuth(app) };
    return cachedBackend;
  }

  const app = getApps().length ? getApps()[0] : initializeApp();
  cachedBackend = { db: getFirestore(app), auth: getAuth(app) };
  return cachedBackend;
}

/** The resolved backend, cached across warm invocations. @type {{ db: any, auth: any } | null} */
let cachedBackend = null;

/** CORS headers needed because the browser sends Authorization and triggers a preflight. */
function setCorsHeaders(res, req) {
  const origin = req?.headers?.origin || req?.headers?.Origin || '*';
  // Echo the requesting origin when present (needed for credentialed preview hosts *.e2b.app),
  // otherwise allow any origin for same-site fetches.
  try { res.setHeader('Access-Control-Allow-Origin', origin || '*'); } catch {}
  try { res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS'); } catch {}
  try { res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With'); } catch {}
  try { res.setHeader('Access-Control-Max-Age', '600'); } catch {}
  // Vary ensures caches key on Origin.
  try { res.setHeader('Vary', 'Origin'); } catch {}
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
  let backend;
  try {
    backend = resolveBackend();
  } catch (error) {
    throw new Error(`Backend not configured: ${error?.message || error}`, { cause: error });
  }
  const decoded = await backend.auth.verifyIdToken(match[1]);
  return { uid: decoded.uid, token: decoded };
}

/** Reads and parses the JSON body, tolerating Vercel's already-parsed object and a raw string. */
function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch { throw new Error('invalid-json'); }
  }
  // Vercel may provide body as Buffer when bodyParser disabled; handle it.
  if (req.body && typeof req.body === 'object' && Buffer.isBuffer(req.body)) {
    const text = req.body.toString('utf8');
    if (!text) return {};
    return JSON.parse(text);
  }
  return {};
}

/** Builds a Firestore store + the handlers for one request. */
function backend() {
  const store = createFirestoreStore(resolveBackend().db, {
    now: () => Date.now(),
    toTimestamp: (ms) => Timestamp.fromMillis(ms),
  });
  const handlers = makeHandlers(store, {
    timestampMs: Date.now(),
    deleteAuthUser: async (uid) => { await resolveBackend().auth.deleteUser(uid); },
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
  setCorsHeaders(res, req);
  // Preflight: the browser sends OPTIONS before POST when Authorization is present.
  if (req.method && req.method.toUpperCase() === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method && req.method.toUpperCase() !== 'POST') {
    res.status(405).json({ code: 'method-not-allowed', message: 'Use POST for this endpoint.' });
    return;
  }

  let body;
  try {
    body = readBody(req);
  } catch (error) {
    const isInvalidJson = String(error?.message || '').includes('invalid-json') || error instanceof SyntaxError;
    if (isInvalidJson) {
      res.status(400).json({ code: 'invalid-json', message: 'The request body was not valid JSON.' });
      return;
    }
    console.error(`[psd-gaming] ${name} failed to read body`, error);
    res.status(400).json({ code: 'invalid-json', message: 'The request body was not valid JSON.' });
    return;
  }

  let uid = '';
  let token = {};
  try {
    ({ uid, token } = await authFromRequest(req));
  } catch (error) {
    const msg = String(error?.message || '');
    if (msg.includes('Backend not configured')) {
      console.error(`[psd-gaming] ${name} backend misconfigured`, error);
      res.status(500).json({
        code: 'backend-misconfigured',
        message: 'The online backend is not configured on this deployment. Set FIREBASE_SERVICE_ACCOUNT or the Workload Identity Federation variables in Vercel and redeploy. See docs/online-play.md.',
      });
      return;
    }
    res.status(401).json({
      code: 'unauthenticated',
      message: 'Sign in (or continue as a guest) before using online features.',
    });
    return;
  }

  let handlers;
  try {
    handlers = backend();
  } catch (error) {
    console.error(`[psd-gaming] ${name} could not build backend`, error);
    res.status(500).json({
      code: 'backend-misconfigured',
      message: error?.message || 'The online backend is not configured correctly.',
    });
    return;
  }

  try {
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
    // Ensure CORS headers are present even on errors.
    setCorsHeaders(res, req);
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
  setCorsHeaders(res, req);
  if (req.method && req.method.toUpperCase() === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  // Vercel Cron sends GET, manual callers may POST; both are allowed.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = String(req.headers?.authorization || req.headers?.Authorization || '');
    const query = String(req.query?.secret || req.url?.split('secret=')[1] || '');
    // Support ?secret=xxx even when req.query is not parsed (plain Node).
    let querySecret = query;
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      querySecret = url.searchParams.get('secret') || querySecret;
    } catch {}
    // Also allow header without Bearer prefix for cron simplicity.
    const ok = header === `Bearer ${secret}` || header === secret || querySecret === secret;
    if (!ok) {
      res.status(401).json({ code: 'unauthenticated', message: 'A valid cron secret is required.' });
      return;
    }
  }
  let backend;
  try {
    backend = resolveBackend();
  } catch (error) {
    console.error('[psd-gaming] cleanup backend misconfigured', error);
    res.status(500).json({ code: 'backend-misconfigured', message: error?.message || 'Backend not configured.' });
    return;
  }
  try {
    const store = createFirestoreStore(backend.db, {
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
