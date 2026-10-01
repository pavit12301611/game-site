/**
 * The online session: "make sure I am a Firebase user".
 *
 * Guests are anonymous Firebase accounts, so joining a room by link never forces a sign-up. Every
 * online feature starts here, which is why it is its own module: rooms, invites and the live check
 * all need it, and none of them need the rest of the account machinery.
 */

import { signInAnonymously } from 'firebase/auth';
import { auth, firebaseReady } from '../firebase.js';
import { setupError } from '../connection.js';
import { withErrorContext } from '../firebase-errors.js';
import { state } from '../state.js';

export async function ensureOnlineUser() {
  if (!firebaseReady) throw setupError();
  // `auth` is null only when the Firebase config was missing or invalid, which the guard above has
  // already turned into an error, so the cast matches exactly what that guard guarantees.
  const authInstance = /** @type {import('firebase/auth').Auth} */ (auth);
  await authInstance.authStateReady();
  if (authInstance.currentUser) {
    state.user = authInstance.currentUser;
    return authInstance.currentUser;
  }
  try {
    const result = await signInAnonymously(authInstance);
    state.user = result.user;
    return result.user;
  } catch (error) {
    throw withErrorContext(error, { method: 'anonymous' });
  }
}
