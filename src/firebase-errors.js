/**
 * Maps Firebase Auth and Firestore error codes to player-facing messages.
 */

const AUTH_MESSAGES = {
  'auth/invalid-api-key': 'Firebase rejected the API key. Copy the Web app config again.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/wrong-password': 'Wrong password.',
  'auth/email-already-in-use': 'That email is already registered. Try signing in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-email': 'That does not look like a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  'auth/network-request-failed': 'Could not reach Firebase. Check your connection.',
  'auth/popup-closed-by-user': 'The sign-in popup was closed before finishing.',
  'auth/popup-blocked': 'The browser blocked the sign-in popup. Allow popups and try again.',
  'auth/cancelled-popup-request': 'Sign-in cancelled.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled. Enable it in Firebase Console → Authentication → Sign-in method.',
  'auth/admin-restricted-operation': 'This operation needs an admin. Enable Anonymous sign-in in Firebase Console.',
  'auth/unauthorized-domain': 'This site is not an authorized domain for Firebase sign-in.',
  'auth/credential-already-in-use': 'That account is already linked to another user.',
  'auth/requires-recent-login': 'Sign in again, then retry within 10 minutes.',
  'auth/invalid-credential': 'Invalid credentials. Check your email and password.',
};

const FIRESTORE_MESSAGES = {
  'permission-denied': 'Firebase denied this action. Make sure the Firestore rules are published.',
  'not-found': 'That document does not exist.',
  'already-exists': 'That already exists.',
  'resource-exhausted': 'Too many requests. Wait a moment.',
  'unavailable': 'Firebase is temporarily unavailable. Try again.',
};

/**
 * Returns a human-readable error message for a Firebase error.
 * @param {any} error
 * @returns {string}
 */
export function friendlyFirebaseError(error) {
  const code = error?.code || '';
  if (AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];
  if (FIRESTORE_MESSAGES[code]) return FIRESTORE_MESSAGES[code];
  return error?.message || 'Something went wrong.';
}