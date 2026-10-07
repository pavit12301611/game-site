/**
 * Firebase initialization: validates config, starts Firebase, connects emulators.
 */

import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { FIREBASE_CONFIG_ENV_NAME, resolveFirebaseConfig, summarizeFirebaseConfig } from './firebase-config.js';
import { describeEmulatorConfig, resolveEmulatorConfig } from './emulator.js';

const silentLogger = /** @type {any} */ ({ error() {}, warn() {} });

export function initializeFirebase(source, { dev = false, logger = console } = {}) {
  const env = source !== null && typeof source === 'object' ? source : { [FIREBASE_CONFIG_ENV_NAME]: source };
  const parsed = resolveFirebaseConfig(env, { dev });
  const configName = parsed.source === 'env-vars' ? 'the VITE_FIREBASE_* variables' : FIREBASE_CONFIG_ENV_NAME;

  let app = null, auth = null, db = null;
  let setup = { status: parsed.status, code: parsed.code, message: parsed.message, hint: parsed.hint, ...summarizeFirebaseConfig(parsed.config) };

  if (parsed.status === 'ok') {
    try {
      const nextApp = initializeApp(/** @type {any} */ (parsed.config));
      const nextAuth = getAuth(nextApp);
      const nextDb = getFirestore(nextApp);
      app = nextApp; auth = nextAuth; db = nextDb;
    } catch (error) {
      const reason = error?.code || error?.name || 'unknown error';
      setup = {
        status: 'invalid', code: 'init-failed',
        message: `Firebase could not start with the config in ${configName} (${reason}).`,
        hint: dev ? 'Fix .env.local and restart.' : 'Fix the values in Vercel and redeploy.',
        projectId: '', authDomain: '',
      };
    }
  }

  const ready = Boolean(app && auth && db);
  if (!ready) {
    const log = dev || setup.status === 'invalid' ? logger.error : logger.warn;
    log.call(logger, `[PSD-gaming] ${setup.message}`, setup.hint);
  }

  return { app, auth, db, ready, setup: Object.freeze({ ...setup }) };
}

const viteEnv = /** @type {any} */ (import.meta).env;
const isDevBuild = Boolean(viteEnv?.DEV);
const services = initializeFirebase(viteEnv ?? {}, {
  dev: isDevBuild,
  logger: viteEnv ? console : silentLogger,
});

const emulator = resolveEmulatorConfig(viteEnv ?? {}, { dev: isDevBuild });
if (services.ready && emulator.enabled) {
  connectFirestoreEmulator(/** @type {any} */ (services.db), emulator.host, emulator.firestorePort);
  connectAuthEmulator(/** @type {any} */ (services.auth), emulator.authUrl, { disableWarnings: true });
  console.info(`[PSD-gaming] ${describeEmulatorConfig(emulator)}`);
}

export function createGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

export const { app, auth, db } = services;
export const firebaseSetup = services.setup;
export const firebaseError = services.ready ? '' : services.setup.message;
export const firebaseReady = services.ready;
export const firebaseEmulator = Object.freeze({ ...emulator });