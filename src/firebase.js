import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import {
  FIREBASE_CONFIG_ENV_NAME,
  resolveFirebaseConfig,
  summarizeFirebaseConfig,
} from './firebase-config.js';

const silentLogger = { error() {}, warn() {} };

/**
 * Validates the Firebase config and starts Firebase only when it is valid.
 *
 * `source` is either the env object (`import.meta.env`: one VITE_FIREBASE_* variable per field, with
 * the one-line JSON VITE_FIREBASE_CONFIG as a fallback) or, for older callers, the raw
 * VITE_FIREBASE_CONFIG string / undefined.
 *
 * - missing / invalid config: Firebase is NOT initialized (`initializeApp` is never called) and
 *   `setup` explains exactly why.
 * - valid config: app, auth and Firestore are created together. If any of them throws, none of
 *   them is exposed and `setup` reports `init-failed`, so the UI can never claim "online" for a
 *   half-started Firebase.
 *
 * The Firebase Web config is public browser configuration (not a secret), but it is still never
 * hard-coded here: it only ever arrives through the build-time environment
 * (VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, … or the legacy VITE_FIREBASE_CONFIG).
 */
export function initializeFirebase(source, { dev = false, logger = console } = {}) {
  const env = source !== null && typeof source === 'object' ? source : { [FIREBASE_CONFIG_ENV_NAME]: source };
  const parsed = resolveFirebaseConfig(env, { dev });
  const configName = parsed.source === 'env-vars' ? 'the VITE_FIREBASE_* variables' : FIREBASE_CONFIG_ENV_NAME;
  let app = null;
  let auth = null;
  let db = null;
  let setup = {
    status: parsed.status,
    code: parsed.code,
    message: parsed.message,
    hint: parsed.hint,
    ...summarizeFirebaseConfig(parsed.config),
  };

  if (parsed.status === 'ok') {
    try {
      const nextApp = initializeApp(parsed.config);
      const nextAuth = getAuth(nextApp);
      const nextDb = getFirestore(nextApp);
      app = nextApp;
      auth = nextAuth;
      db = nextDb;
    } catch (error) {
      const reason = error?.code || error?.name || 'unknown error';
      setup = {
        status: 'invalid',
        code: 'init-failed',
        message: `Firebase could not start with the config in ${configName} (${reason}). Double-check the values in Firebase Console → Project settings → Your apps.`,
        hint: dev
          ? 'Fix the value(s) in .env.local and restart npm run dev.'
          : 'Fix the value(s) in Vercel → Project → Settings → Environment Variables, then redeploy.',
        projectId: '',
        authDomain: '',
      };
    }
  }

  const ready = Boolean(app && auth && db);
  if (!ready) {
    // Development: always an error, so a missing or bad config cannot be overlooked while coding.
    // Production: an error for a broken value, a warning for a variable that was never set.
    const log = dev || setup.status === 'invalid' ? logger.error : logger.warn;
    log.call(logger, `[PSD-gaming] ${setup.message}`, setup.hint);
  }

  return { app, auth, db, ready, setup: Object.freeze({ ...setup }) };
}

const viteEnv = import.meta.env;
const services = initializeFirebase(viteEnv ?? {}, {
  dev: Boolean(viteEnv?.DEV),
  // Outside Vite (for example when unit tests import this file) there is no env to complain about.
  logger: viteEnv ? console : silentLogger,
});

export function createGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

export const { app, auth, db } = services;
/** Why Firebase is (not) running: { status: 'ok' | 'missing' | 'invalid', code, message, hint, projectId, authDomain }. */
export const firebaseSetup = services.setup;
/** Human-readable setup problem, or '' when Firebase is ready. Kept for older imports. */
export const firebaseError = services.ready ? '' : services.setup.message;
export const firebaseReady = services.ready;
