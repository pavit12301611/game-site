/**
 * The setup dialog's "Run check" button: a real, user-started test against the real project.
 *
 * It signs in as a guest and reads one document, which is the smallest thing that proves Auth, the
 * API key, Firestore and the published rules all line up. Every step reports what it did, and every
 * failure is reported in the same wording the rest of the app uses.
 */

import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { connection } from './connection.js';
import { friendlyError } from './errors.js';
import { render } from './render.js';
import { state } from './state.js';
import { ensureOnlineUser } from './online/session.js';

/**
 * `db` and `auth` are null only when Firebase never started, and the live check never runs in that
 * case (the button stays disabled unless online features are available).
 */
const store = /** @type {import('firebase/firestore').Firestore} */ (db);
const authInstance = /** @type {import('firebase/auth').Auth} */ (auth);

export function withTimeout(promise, ms, message) {
  let timer = 0;
  const timeout = new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

/** Explicit, user-started check against the real Firebase project this build is configured for. */
export async function runLiveCheck() {
  if (!connection().onlineFeatures || state.liveCheck?.running) return;
  state.liveCheck = { running: true, steps: [] };
  render();
  const steps = [];
  try {
    await authInstance.authStateReady();
    const hadUser = Boolean(authInstance.currentUser);
    const user = await withTimeout(ensureOnlineUser(), 15000, 'Signing in took longer than 15 seconds. Check your connection and try again.');
    steps.push({
      ok: true,
      label: 'Firebase Auth is reachable and accepted the API key',
      detail: hadUser
        ? 'Already signed in, so no new sign-in was attempted (the Anonymous provider was not re-tested).'
        : 'Signed in as a guest, so the Anonymous provider is enabled.',
    });
    try {
      await withTimeout(getDoc(doc(store, 'admins', user.uid)), 15000, 'Firestore did not answer within 15 seconds. Check that the Firestore database exists and your connection works.');
      steps.push({ ok: true, label: 'Firestore is reachable and the rules are published', detail: 'Read your own admins/{uid} document, which firestore.rules allows for any signed-in user.' });
    } catch (error) {
      steps.push({ ok: false, label: 'Firestore check failed', detail: friendlyError(error) });
    }
  } catch (error) {
    steps.push({ ok: false, label: 'Firebase Auth check failed', detail: friendlyError(error, { method: 'anonymous' }) });
  }
  state.liveCheck = { running: false, steps };
  render();
}
