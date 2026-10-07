/**
 * The bridge to the trusted backend, now served by Vercel serverless functions.
 *
 * Every online mutation goes through here: claim a username, look up a player, send or answer a
 * request, invite, create/join/start/leave a room, move, rematch, block, report, delete an account,
 * and the admin's room controls. The browser never writes those documents itself any more, so
 * `firestore.rules` can deny it outright, and hidden state (codes, fleets, answer keys) never
 * reaches a client.
 *
 * The backend used to be a set of Firebase callable Cloud Functions (`httpsCallable`). It now runs
 * as Vercel serverless functions under `/api/<name>` (see `api/_backend.js`), reached with a plain
 * same-origin `fetch`. That changes exactly one thing on this side: where a callable received the
 * caller's identity from `request.auth` for free, an HTTP route has to be handed it, so every
 * request carries the current user's Firebase ID token in the `Authorization: Bearer` header and the
 * function verifies it before running the shared handler.
 *
 * Two things this module is still responsible for:
 *
 *   - **Failing clearly when Firebase is not configured.** `callBackend` throws the setup error up
 *     front, because without Firebase Auth there is no token to send and local practice is all that
 *     is left — the same behaviour as before the move.
 *   - **Turning backend errors into sentences.** The functions answer with a `code` and a
 *     player-facing `message`; we keep both, mark the error `playerFacing`, and `friendlyError()`
 *     shows it as-is instead of guessing at an SDK code.
 */

import { auth, firebaseReady } from '../firebase.js';
import { setupError } from '../connection.js';

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

/** Shown when the request reached nothing — the route is missing or the deploy is incomplete. */
const DEPLOYMENT_HINT = 'The online backend is not responding. If this keeps happening for every room, the Vercel deployment may be incomplete — check that the `api/` functions are deployed. Local practice keeps working without it.';

/** The message every unauthenticated failure carries, so a missing token reads the same everywhere. */
const UNAUTHENTICATED_MESSAGE = 'Sign in (or continue as a guest) before using online features.';

/** A sensible policy code when the function answered with only an HTTP status and no body. */
function fallbackCode(status) {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'permission-denied';
  if (status === 404) return 'backend-missing';
  if (status === 429) return 'rate-limited';
  return 'backend-error';
}

/**
 * POSTs to one Vercel api function and returns its JSON payload.
 *
 * The Firebase ID token is attached as a Bearer token; without a signed-in user it is omitted and
 * the function answers `unauthenticated`, exactly as a callable would have.
 * @template {Record<string, any>} T
 * @param {string} name
 * @param {Record<string, any>} [data]
 * @returns {Promise<T>}
 */
async function callApi(name, data = {}) {
  const user = auth?.currentUser;
  let token = '';
  if (user) {
    try {
      token = await user.getIdToken();
    } catch {
      token = '';
    }
  }

  let response;
  try {
    response = await fetch(`/api/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data ?? {}),
    });
  } catch (error) {
    throw new BackendError('backend-unreachable', 'The online service is unreachable right now. Check your connection and try again.', { cause: error });
  }

  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) {
    const code = typeof body?.code === 'string' && body.code ? body.code : fallbackCode(response.status);
    const retryAfterMs = Number(body?.retryAfterMs) || 0;
    const hint = code === 'backend-missing' ? DEPLOYMENT_HINT : '';
    const message = body?.message
      || (code === 'unauthenticated' ? UNAUTHENTICATED_MESSAGE : 'The online service could not complete that action.');
    throw new BackendError(code, message, { hint, retryAfterMs });
  }

  return /** @type {T} */ (body ?? {});
}

/**
 * Calls one backend function and returns its payload.
 * @template {Record<string, any>} T
 * @param {string} name
 * @param {Record<string, any>} [data]
 * @returns {Promise<T>}
 */
export async function callBackend(name, data = {}) {
  // Without a Firebase config there is no way to mint the token the api function verifies, so say
  // that plainly instead of letting the request fail as an anonymous 401.
  if (!firebaseReady) throw setupError();
  return callApi(name, data);
}
