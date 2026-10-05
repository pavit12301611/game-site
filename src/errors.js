/**
 * How a Firebase error becomes a sentence a player can act on.
 *
 * `friendlyError` wraps `describeFirebaseError` with the two facts the wording needs (is the
 * browser online, and which host is this), so no caller has to remember them. `reportAuthError`
 * picks where the message goes: inside the sign-in dialog when it is open, otherwise a toast.
 */

import { state } from './state.js';
import { render } from './render.js';
import { showToast } from './ui/toast.js';
import { describeFirebaseError } from './firebase-errors.js';

export function friendlyError(error, context = {}) {
  // Errors from the trusted backend (`src/online/callables.js`) already carry a sentence written for
  // the player, plus the backend's own code. Passing them through keeps that wording instead of
  // guessing from an SDK code.
  if (error?.playerFacing && typeof error.message === 'string' && error.message) return error.message;
  return describeFirebaseError(error, { online: navigator.onLine !== false, hostname: location.hostname, ...context });
}

/** Sign-in errors stay visible inside the sign-in dialog; anywhere else they are a toast. */
export function reportAuthError(error, context = {}) {
  const message = friendlyError(error, context);
  if (state.modal?.type === 'auth') {
    state.authError = message;
    render();
  } else {
    showToast(message, 'warning');
  }
}
