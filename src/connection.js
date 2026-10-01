/**
 * What the app knows about its own connection right now.
 *
 * `connection()` is the single source of truth for the header dot, the setup callout, the room
 * screen and every "online play is off" message: it folds the real Firebase setup check
 * (`firebaseSetup`) and the browser's online flag into one described state. The two helpers below it
 * turn that state into the exact wording a modal or a toast shows.
 */

import { state } from './state.js';
import { describeConnection } from './connection-status.js';
import { firebaseSetup } from './firebase.js';

/** What the connection currently is, derived from the real Firebase setup and the browser's online flag. */
export function connection() {
  return describeConnection({ setup: firebaseSetup, online: state.online });
}

/** Why online play is unavailable right now, phrased for a modal or toast. '' when it is available. */
export function onlineUnavailableNote(conn = connection()) {
  if (conn.onlineFeatures) return '';
  if (conn.setupNeeded) return `Online rooms are off. ${conn.detail} Local practice works now.`;
  return 'You’re offline. Online rooms come back when you reconnect; local practice works now.';
}

export function setupError() {
  return new Error(firebaseSetup.message || 'Firebase is not ready. You can still practice games locally.');
}
