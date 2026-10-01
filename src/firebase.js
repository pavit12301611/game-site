import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import {
  FIREBASE_CONFIG_ENV_NAME,
  resolveFirebaseConfig,
  summarizeFirebaseConfig,
} from './firebase-config.js';
import { describeEmulatorConfig, resolveEmulatorConfig } from './emulator.js';

/** @type {Console} */
const silentLogger = /** @type {any} */ ({ error() {}, warn() {} });

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
  const env = source !== null && typeof source === 'object' ? /** @type {Record<string, string | undefined>} */ (source) : { [FIREBASE_CONFIG_ENV_NAME]: source };
  const parsed = resolveFirebaseConfig(env, { dev });
  const configName = parsed.source === 'env-vars' ? 'the VITE_FIREBASE_* variables' : FIREBASE_CONFIG_ENV_NAME;
  /** @type {import('firebase/app').FirebaseApp | null} */
  let app = null;
  /** @type {import('firebase/auth').Auth | null} */
  let auth = null;
  /** @type {import('firebase/firestore').Firestore | null} */
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
      const nextApp = initializeApp(/** @type {import('firebase/app').FirebaseOptions} */ (parsed.config));
      const nextAuth = getAuth(nextApp);
      const nextDb = getFirestore(nextApp);
      app = nextApp;
      auth = nextAuth;
      db = nextDb;
    } catch (error) {
      const reason = /** @type {any} */ (error)?.code || /** @type {any} */ (error)?.name || 'unknown error';
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

const viteEnv = /** @type {any} */ (import.meta).env;
const isDevBuild = Boolean(viteEnv?.DEV);
const services = initializeFirebase(viteEnv ?? {}, {
  dev: isDevBuild,
  // Outside Vite (for example when unit tests import this file) there is no env to complain about.
  logger: viteEnv ? console : silentLogger,
});

/**
 * Local development can run against the Firebase Emulator Suite (npm run dev:emu).
 * The flag is read there, in one place, and is ignored in a production build.
 */
const emulator = resolveEmulatorConfig(viteEnv ?? {}, { dev: isDevBuild });
if (services.ready && emulator.enabled) {
  connectFirestoreEmulator(/** @type {import('firebase/firestore').Firestore} */ (services.db), emulator.host, emulator.firestorePort);
  connectAuthEmulator(/** @type {import('firebase/auth').Auth} */ (services.auth), emulator.authUrl, { disableWarnings: true });
  console.info(`[PSD-gaming] ${describeEmulatorConfig(emulator)}`);
}

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
/** Where this build is talking to: the real project, or the local emulator suite. */
export const firebaseEmulator = Object.freeze({ ...emulator });
