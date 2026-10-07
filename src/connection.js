/**
 * What the app knows about its own connection right now.
 */

import { state } from './state.js';
import { describeConnection } from './connection-status.js';
import { firebaseSetup } from './firebase.js';

export function connection() {
  return describeConnection({ setup: firebaseSetup, online: state.online });
}

export function onlineUnavailableNote(conn = connection()) {
  if (conn.onlineFeatures) return '';
  if (conn.setupNeeded) return `Online rooms are off. ${conn.detail} Local practice works now.`;
  return 'You\'re offline. Online rooms come back when you reconnect; local practice works now.';
}

export function setupError() {
  return new Error(firebaseSetup.message || 'Firebase is not ready. You can still practice games locally.');
}