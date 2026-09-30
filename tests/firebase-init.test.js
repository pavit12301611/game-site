import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, getApps, initializeApp } from 'firebase/app';
import { firebaseError, firebaseReady, firebaseSetup, initializeFirebase } from '../src/firebase.js';

const VALID = {
  apiKey: 'test-api-key-123',
  authDomain: 'psd-arcade-test.firebaseapp.com',
  projectId: 'psd-arcade-test',
  storageBucket: 'psd-arcade-test.appspot.com',
  messagingSenderId: '123456789012',
  appId: '1:123456789012:web:0a1b2c3d4e5f',
};
const PEM_HEADER = `-----BEGIN ${'PRIVATE'} KEY-----`;

function recordingLogger() {
  const calls = { error: [], warn: [] };
  return { calls, error: (...args) => calls.error.push(args), warn: (...args) => calls.warn.push(args) };
}

// These tests run the REAL Firebase SDK (initializeApp/getAuth/getFirestore). Nothing here touches
// the network: initialization is local, and no Firebase operation is ever called.
afterEach(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
});

test('Firebase is not initialized at all when the config is missing', () => {
  const logger = recordingLogger();
  const result = initializeFirebase(undefined, { logger });
  assert.equal(result.ready, false);
  assert.equal(result.app, null);
  assert.equal(result.auth, null);
  assert.equal(result.db, null);
  assert.equal(getApps().length, 0, 'initializeApp must not run without a valid config');
  assert.equal(result.setup.status, 'missing');
  assert.equal(result.setup.message, 'Firebase config is missing from this deployment. Add VITE_FIREBASE_CONFIG in Vercel and redeploy.');
  // production: a never-set variable is a warning, not an error
  assert.equal(logger.calls.warn.length, 1);
  assert.equal(logger.calls.error.length, 0);
  assert.match(logger.calls.warn[0][0], /^\[PSD-gaming\] Firebase config is missing from this deployment/);
});

test('in development a missing config is logged as a console error, pointing at .env.local', () => {
  const logger = recordingLogger();
  const result = initializeFirebase(undefined, { dev: true, logger });
  assert.equal(result.ready, false);
  assert.equal(logger.calls.error.length, 1);
  assert.equal(logger.calls.warn.length, 0);
  assert.match(logger.calls.error[0][0], /\.env\.local/);
});

test('an invalid config is never passed to Firebase and is always logged as an error', () => {
  for (const dev of [false, true]) {
    const logger = recordingLogger();
    const raw = `'${JSON.stringify(VALID)}'`;
    const result = initializeFirebase(raw, { dev, logger });
    assert.equal(result.ready, false);
    assert.equal(result.setup.status, 'invalid');
    assert.equal(result.setup.code, 'wrapped-in-quotes');
    assert.equal(getApps().length, 0);
    assert.equal(logger.calls.error.length, 1, `dev=${dev}`);
    assert.doesNotMatch(String(logger.calls.error[0]), /test-api-key-123/, 'the value is never logged');
  }
  for (const raw of ['{"apiKey":"a"}', 'not json', '{"apiKey":"...","authDomain":"your-project.firebaseapp.com","projectId":"your-project","appId":"1:1:web:..."}']) {
    const result = initializeFirebase(raw, { logger: recordingLogger() });
    assert.equal(result.ready, false, raw);
    assert.equal(getApps().length, 0, raw);
  }
});

test('a secret pasted into the variable is refused and never logged', () => {
  const logger = recordingLogger();
  const raw = JSON.stringify({ type: 'service_account', private_key: `${PEM_HEADER}\nSENTINEL\n`, client_email: 'a@b.iam.gserviceaccount.com' });
  const result = initializeFirebase(raw, { logger });
  assert.equal(result.ready, false);
  assert.equal(result.setup.code, 'secret-detected');
  assert.equal(getApps().length, 0);
  assert.doesNotMatch(JSON.stringify(logger.calls), /SENTINEL|iam\.gserviceaccount|BEGIN/);
});

test('a valid config initializes app, auth and Firestore together, and logs nothing', () => {
  const logger = recordingLogger();
  const result = initializeFirebase(JSON.stringify(VALID), { logger });
  assert.equal(result.ready, true);
  assert.equal(result.setup.status, 'ok');
  assert.equal(result.setup.message, '');
  assert.equal(result.setup.projectId, 'psd-arcade-test');
  assert.equal(result.setup.authDomain, 'psd-arcade-test.firebaseapp.com');
  assert.equal(getApps().length, 1);
  assert.equal(result.app.options.projectId, 'psd-arcade-test');
  assert.equal(result.auth.app, result.app);
  assert.equal(result.db.app, result.app);
  assert.equal(logger.calls.error.length + logger.calls.warn.length, 0);
  assert.ok(Object.isFrozen(result.setup));
  assert.equal(Object.values(result.setup).includes(VALID.apiKey), false, 'the API key is not part of the diagnostics object');
});

test('if Firebase itself refuses to start, nothing half-initialized is exposed', () => {
  // A default app with different options already exists, so the SDK throws app/duplicate-app.
  initializeApp({ ...VALID, projectId: 'some-other-project', appId: '1:1:web:1' });
  const logger = recordingLogger();
  const result = initializeFirebase(JSON.stringify(VALID), { logger });
  assert.equal(result.ready, false);
  assert.equal(result.app, null);
  assert.equal(result.auth, null);
  assert.equal(result.db, null);
  assert.equal(result.setup.status, 'invalid');
  assert.equal(result.setup.code, 'init-failed');
  assert.match(result.setup.message, /Firebase could not start with the config in VITE_FIREBASE_CONFIG/);
  assert.equal(logger.calls.error.length, 1);
});

test('the module-level exports report "not ready" when there is no Vite environment (as under node --test)', () => {
  assert.equal(firebaseReady, false);
  assert.equal(firebaseSetup.status, 'missing');
  assert.equal(firebaseError, firebaseSetup.message);
  assert.equal(firebaseError, 'Firebase config is missing from this deployment. Add VITE_FIREBASE_CONFIG in Vercel and redeploy.');
});
