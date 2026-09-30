import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

let app = null;
let auth = null;
let db = null;
let firebaseError = '';

const rawConfig = import.meta.env.VITE_FIREBASE_CONFIG;
if (rawConfig) {
  try {
    const config = JSON.parse(rawConfig);
    const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
    const missing = required.filter((key) => !config[key]);
    if (missing.length) throw new Error(`Missing Firebase fields: ${missing.join(', ')}`);
    app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (error) {
    firebaseError = error instanceof Error ? error.message : 'The Firebase configuration could not be read.';
    console.error('[PSD-gaming] Firebase configuration error:', firebaseError);
  }
} else {
  firebaseError = 'Firebase is not configured yet. You can still browse and practice locally.';
}

export function createGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

export { app, auth, db, firebaseError };
export const firebaseReady = Boolean(app && auth && db);
