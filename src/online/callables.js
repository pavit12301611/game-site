/**
 * The bridge to the trusted backend.
 *
 * Every online mutation goes through here: claim a username, look up a player, send or answer a
 * request, invite, create/join/start/leave a room, move, rematch, block, report, delete an account,
 * and the admin's room controls. The browser never writes those documents itself, so
 * `firestore.rules` can deny it outright, and hidden state (codes, fleets, answer keys) never
 * reaches a client.
 *
 * The backend runs in one of two places, chosen at build time with `VITE_BACKEND_URL`:
 *
 *   - **unset (the default): the same-origin Vercel serverless functions in `api/`.** The site is
 *     hosted on Vercel, so `POST /api/backend/<name>` is a same-origin fetch — no CORS preflight,
 *     no Firebase Blaze plan. The caller proves who they are with a Firebase ID token in the
 *     Authorization header; the backend verifies it with the Admin SDK. The failure shapes mirror
 *     the callable SDK on purpose, so the mapping below is shared.
 *   - **`'firebase'`: Firebase callable Cloud Functions** (`https://<region>-<project>.cloudfunctions.net/<name>`),
 *     which needs the Blaze plan and `firebase deploy --only functions`.
 *
 * Two things this module is responsible for either way:
 *
 *   - **Failing clearly when the backend is not there.** A deployment without the backend would
 *     otherwise answer every room click with an opaque error. The messages below say what is
 *     missing and that local practice still works.
 *   - **Turning backend errors into sentences.** The functions send a `code` and a player-facing
 *     message; we keep both, mark the error `playerFacing`, and `friendlyError()` shows it as-is
 *     instead of guessing at an SDK code.
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth, firebaseReady } from '../firebase.js';
import { setupError } from '../connection.js';

/**
 * `app`/`auth` are null only when Firebase never started; then both transports are unusable and
 * `callBackend` throws the setup error, exactly like the other online modules do.
 */
const functions = firebaseReady && app ? getFunctions(app) : null;

/**
 * `VITE_BACKEND_URL` selects the transport (see the module comment). Anything except the literal
 * `firebase` is treated as a backend base URL; the default is the same-origin Vercel route.
 */
const BACKEND_URL = String(import.meta.env?.VITE_BACKEND_URL ?? '').trim();
const useFirebaseCallables = BACKEND_URL === 'firebase';
const httpBackendBase = (BACKEND_URL && !useFirebaseCallables ? BACKEND_URL : '/api/backend').replace(/\/+$/, '');

/** Whether the SDK side of the backend is usable at all (the deployment is checked per call). */
export function backendReady() {
  return Boolean(useFirebaseCallables ? functions : auth);
}

/**
 * A failure the player can read. `code` is the backend's policy code when there is one (so callers
 * can branch on `room-full`, `rate-limited`, …), `playerFacing` tells `friendlyError` to pass the
 * message through untouched.
 */
export class BackendError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{ hint?: string, retryAfterMs?: number, cause?: unknown }} [options]
   */
  constructor(code, message, { hint = '', retryAfterMs = 0, cause } = {}) {
    super(message);
    this.name = 'BackendError';
    this.code = code;
    this.hint = hint;
    this.retryAfterMs = retryAfterMs;
    this.playerFacing = true;
    this.cause = cause;
  }
}

/** Messages for the failures that are about the deployment rather than about a move. */
const DEPLOYMENT_HINT = 'The online backend is not available for this deployment yet. On Vercel (the free deployment) the backend ships with the site: add a FIREBASE_SERVICE_ACCOUNT environment variable in Vercel → Settings → Environment Variables and redeploy. Hosting it as Firebase Cloud Functions instead needs the Blaze plan: `firebase deploy --only functions`. Local practice keeps working without it.';

/** @param {any} error @param {string} name */
export function toBackendError(error, name) {
  const rawCode = String(error?.code || '').replace(/^functions\//, '');
  const details = /** @type {Record<string, any>} */ (error?.details || {});
  const policyCode = typeof details.code === 'string' && details.code ? details.code : '';
  const retryAfterMs = Number(details.retryAfterMs) || 0;

  if (policyCode) {
    // The function answered with one of our own codes and a sentence written for the player.
    return new BackendError(policyCode, error.message || 'That action could not be completed.', { retryAfterMs, cause: error });
  }
  // The backend host answered, but it has no credentials: the message says exactly what to add.
  if (rawCode === 'internal' && /FIREBASE_SERVICE_ACCOUNT/i.test(String(error?.message || ''))) {
    return new BackendError('backend-unconfigured', error.message, { hint: 'Vercel → Settings → Environment Variables → add FIREBASE_SERVICE_ACCOUNT (the service-account key JSON) for Production and Preview, then redeploy.', cause: error });
  }
  if (rawCode === 'not-found') {
    return new BackendError('backend-missing', `The online service is not responding (${name}).`, { hint: DEPLOYMENT_HINT, cause: error });
  }
  // Both transports turn a request that never got through into code "internal" with the bare word
  // "internal" for the message and no details: a rejected fetch carries no HTTP status either side
  // can read. From a browser that is exactly what an *undeployed* backend looks like — the
  // endpoint answers 404, that 404 has no `Access-Control-Allow-Origin` header, so a preflight
  // fails and the console shows a CORS error that masks the real problem. A dropped connection
  // produces the same signature, so the sentence names both and the hint names the fix.
  if (rawCode === 'internal' && /^internal$/i.test(String(error?.message || '').trim())) {
    return new BackendError(
      'backend-unreachable',
      'The online service is not answering. Check your connection and try again; if every online action fails like this, the backend is not deployed for this site yet — local practice still works.',
      { hint: DEPLOYMENT_HINT, cause: error },
    );
  }
  if (rawCode === 'failed-precondition' && /billing|enabled|API/i.test(String(error?.message || ''))) {
    return new BackendError('backend-billing', 'Cloud Functions is not enabled for this Firebase project.', { hint: DEPLOYMENT_HINT, cause: error });
  }
  if (['unavailable', 'deadline-exceeded', 'internal', 'unknown'].includes(rawCode)) {
    return new BackendError(rawCode === 'internal' ? 'backend-error' : rawCode, rawCode === 'unavailable'
      ? 'The online service is unreachable right now. Check your connection and try again.'
      : 'The online service hit an unexpected problem. Please try again.', { hint: 'If this keeps happening for every room, the backend may not be deployed: `firebase deploy --only functions`.', cause: error });
  }
  if (rawCode === 'unauthenticated') {
    return new BackendError('unauthenticated', 'Sign in (or continue as a guest) before using online features.', { cause: error });
  }
  if (rawCode === 'permission-denied') {
    return new BackendError('permission-denied', error.message || 'That action is not allowed for this account.', { cause: error });
  }
  if (rawCode === 'resource-exhausted') {
    return new BackendError('rate-limited', error.message || 'Too many requests. Try again in a few minutes.', { retryAfterMs, cause: error });
  }
  return new BackendError(rawCode || 'backend-error', error?.message || 'The online service could not complete that action.', { cause: error });
}

/**
 * Turns one HTTP response from the same-origin backend into the same error shape the callable SDK
 * produces, so `toBackendError` handles both transports with one mapping.
 * @param {number} status
 * @param {any} body
 * @returns {{ code: string, message: string, details?: Record<string, any> }}
 */
export function errorFromHttpResponse(status, body) {
  const error = body?.error;
  if (error && typeof error.status === 'string' && error.status) {
    return { code: `functions/${error.status}`, message: String(error.message || error.status), details: error.details };
  }
  if (status === 404) return { code: 'functions/not-found', message: 'not-found' };
  // No body at all (a proxy or host error page): the opaque "internal" is the honest answer.
  return { code: 'functions/internal', message: 'internal' };
}

/** @param {string} name */
function httpUrlFor(name) {
  return `${httpBackendBase}/${encodeURIComponent(name)}`;
}

/**
 * Calls the backend over the same-origin (or explicitly configured) HTTP route.
 * @param {string} name
 * @param {Record<string, any>} data
 */
async function callViaHttp(name, data) {
  const authInstance = /** @type {import('firebase/auth').Auth} */ (auth);
  const user = authInstance?.currentUser;
  if (!user) {
    throw new BackendError('unauthenticated', 'Sign in (or continue as a guest) before using online features.');
  }
  /** @type {string} */
  let token;
  try {
    token = await user.getIdToken();
  } catch (error) {
    throw new BackendError('unauthenticated', 'Your sign-in expired. Refresh the page and try again.', { cause: error });
  }
  const response = await fetch(httpUrlFor(name), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data ?? {}),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || !('result' in body)) {
    throw errorFromHttpResponse(response.status, body);
  }
  return body.result ?? {};
}

/**
 * Calls the backend through Firebase's callable SDK (the `VITE_BACKEND_URL=firebase` transport).
 * @param {string} name
 * @param {Record<string, any>} data
 */
async function callViaFirebase(name, data) {
  const callable = httpsCallable(/** @type {any} */ (functions), name);
  const result = await callable(data);
  return /** @type {Record<string, any>} */ (result?.data ?? {});
}

/**
 * Calls one backend function and returns its payload.
 *
 * @template {Record<string, any>} T
 * @param {string} name
 * @param {Record<string, any>} [data]
 * @returns {Promise<T>}
 */
export async function callBackend(name, data = {}) {
  if (useFirebaseCallables ? !functions : !auth) throw setupError();
  try {
    const payload = useFirebaseCallables ? await callViaFirebase(name, data) : await callViaHttp(name, data);
    return /** @type {T} */ (payload);
  } catch (error) {
    if (error instanceof BackendError) throw error;
    throw toBackendError(error, name);
  }
}
