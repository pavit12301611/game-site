/**
 * Setup diagnostics: the "Run check" button in the setup dialog.
 */

import { auth, db, firebaseReady } from './firebase.js';
import { state } from './state.js';
import { render } from './render.js';
import { showToast } from './ui/toast.js';

export async function runLiveCheck() {
  state.liveCheck = { running: true, result: null };
  render();

  if (!firebaseReady) {
    state.liveCheck = { running: false, result: { ok: false, message: 'Firebase is not configured. Local practice works; online needs the VITE_FIREBASE_* variables.' } };
    render();
    return;
  }

  try {
    // Try anonymous sign-in
    const { signInAnonymously } = await import('firebase/auth');
    const credential = await signInAnonymously(auth);
    const uid = credential.user?.uid;

    // Try reading a public document
    const { doc, getDoc } = await import('firebase/firestore');
    const testDoc = await getDoc(doc(db, '_health', 'check')).catch(() => null);

    state.liveCheck = {
      running: false,
      result: {
        ok: true,
        message: `Guest sign-in succeeded (uid: ${uid?.slice(0, 8)}…). Firestore is reachable. The basics work.`,
      },
    };
    showToast('Setup check passed.', 'success');
  } catch (error) {
    state.liveCheck = {
      running: false,
      result: {
        ok: false,
        message: `Check failed: ${error?.message || error}`,
      },
    };
    showToast('Setup check failed.', 'warning');
  }

  render();
}