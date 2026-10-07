/**
 * Online session: ensures the user has a Firebase identity (anonymous if guest).
 */

import { auth, firebaseReady } from '../firebase.js';
import { signInAnonymously } from 'firebase/auth';

/**
 * Ensures the user has a Firebase account (anonymous if needed).
 * @returns {Promise<import('firebase/auth').User>}
 */
export async function ensureOnlineUser() {
  if (!firebaseReady) throw new Error('Firebase is not configured.');
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
}