/**
 * Error handling: turns errors into player-facing messages.
 */

import { friendlyFirebaseError } from './firebase-errors.js';
import { state } from './state.js';

/**
 * Turns any error into a sentence a player can act on.
 * @param {any} error
 * @returns {string}
 */
export function friendlyError(error) {
  if (!error) return 'Something went wrong.';
  if (error.code && typeof error.code === 'string') {
    const fb = friendlyFirebaseError(error);
    if (fb !== error.message) return fb;
  }
  return error.message || 'Something went wrong.';
}

/**
 * Reports an auth error: sets the authError state and re-renders.
 * @param {any} error
 * @param {{ method: string }} context
 */
export function reportAuthError(error, context) {
  const message = friendlyError(error);
  state.authError = message;
  console.error(`[PSD-gaming] ${context.method} sign-in failed:`, error);
}