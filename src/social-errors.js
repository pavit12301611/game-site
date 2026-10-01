import { getFirebaseErrorCode } from './firebase-errors.js';

/**
 * Replace stale-document Firestore errors with copy that tells the player an invite has expired.
 * @param {unknown} error
 * @param {string} message
 * @returns {unknown}
 */
export function unavailableSocialDocument(error, message) {
  return ['not-found', 'permission-denied'].includes(getFirebaseErrorCode(error))
    ? new Error(message)
    : error;
}
