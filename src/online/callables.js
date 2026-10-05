/**
 * The bridge to the trusted backend (Cloud Functions).
 *
 * Every online mutation goes through here: claim a username, look up a player, send or answer a
 * request, invite, create/join/start/leave a room, move, rematch, block, report, delete an account,
 * and the admin's room controls. The browser never writes those documents itself any more, so
 * `firestore.rules` can deny it outright, and hidden state (codes, fleets, answer keys) never
 * reaches a client.
 *
 * Two things this module is responsible for:
 *
 *   - **Failing clearly when the backend is not there.** A project with rules but no deployed
 *     functions would otherwise answer every room click with an opaque error. The messages below
 *     say what is missing and that local practice still works.
 *   - **Turning backend errors into sentences.** The functions send a `code` and a player-facing
 *     message; we keep both, mark the error `playerFacing`, and `friendlyError()` shows it as-is
 *     instead of guessing at an SDK code.
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, firebaseReady } from '../firebase.js';
import { setupError } from '../connection.js';

/**
 * `app` is null only when Firebase never started; then `functions` is null too and `callBackend`
 * throws the setup error, exactly like the other online modules do.
 */
const functions = firebaseReady && app ? getFunctions(app) : null;

/** Whether the SDK side of the backend is usable at all (the deployment is checked per call). */
export function backendReady() {
  return Boolean(functions);
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
const DEPLOYMENT_HINT = 'The online backend is not available for this Firebase project yet. An operator has to deploy it: `firebase deploy --only functions` (Cloud Functions needs the Blaze plan). Local practice keeps working without it.';

/** @param {any} error @param {string} name */
function toBackendError(error, name) {
  const rawCode = String(error?.code || '').replace(/^functions\//, '');
  const details = /** @type {Record<string, any>} */ (error?.details || {});
  const policyCode = typeof details.code === 'string' && details.code ? details.code : '';
  const retryAfterMs = Number(details.retryAfterMs) || 0;

  if (policyCode) {
    // The function answered with one of our own codes and a sentence written for the player.
    return new BackendError(policyCode, error.message || 'That action could not be completed.', { retryAfterMs, cause: error });
  }
  if (rawCode === 'not-found') {
    return new BackendError('backend-missing', `The online service is not responding (${name}).`, { hint: DEPLOYMENT_HINT, cause: error });
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
 * Calls one backend function and returns its payload.
 *
 * @template {Record<string, any>} T
 * @param {string} name
 * @param {Record<string, any>} [data]
 * @returns {Promise<T>}
 */
export async function callBackend(name, data = {}) {
  if (!functions) throw setupError();
  try {
    const callable = httpsCallable(/** @type {any} */ (functions), name);
    const result = await callable(data);
    return /** @type {T} */ (result?.data ?? {});
  } catch (error) {
    throw toBackendError(error, name);
  }
}
