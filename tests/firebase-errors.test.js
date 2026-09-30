import test from 'node:test';
import assert from 'node:assert/strict';
import { FirebaseError } from 'firebase/app';
import { FirestoreError } from 'firebase/firestore';
import { describeFirebaseError, getFirebaseErrorCode, withErrorContext } from '../src/firebase-errors.js';

// Real SDK error classes, so the code strings are exactly what the browser will see.
const authError = (code) => new FirebaseError(code, `Firebase: Error (${code}).`);
const firestoreError = (code, message = 'Missing or insufficient permissions.') => new FirestoreError(code, message);

test('the real SDK error classes expose plain codes that the mapper understands', () => {
  assert.equal(getFirebaseErrorCode(firestoreError('permission-denied')), 'permission-denied');
  assert.equal(getFirebaseErrorCode(authError('auth/operation-not-allowed')), 'auth/operation-not-allowed');
  assert.equal(getFirebaseErrorCode({ code: 'firestore/permission-denied' }), 'permission-denied');
  assert.equal(getFirebaseErrorCode(null), '');
  assert.equal(getFirebaseErrorCode(new Error('x')), '');
});

test('auth/operation-not-allowed names the sign-in method that has to be enabled', () => {
  const error = authError('auth/operation-not-allowed');
  assert.match(describeFirebaseError(error, { method: 'google' }), /Google sign-in is not enabled.*Authentication → Sign-in method.*enable Google/s);
  assert.match(describeFirebaseError(error, { method: 'password' }), /Email\/Password sign-in is not enabled.*enable Email\/Password/s);
  assert.match(describeFirebaseError(error, { method: 'anonymous' }), /Guest play needs Anonymous sign-in.*enable Anonymous/s);
  const generic = describeFirebaseError(error);
  assert.match(generic, /Authentication → Sign-in method/);
  assert.match(generic, /Anonymous, Email\/Password and Google/);
});

test('auth/admin-restricted-operation (what a disabled Anonymous provider can throw) points at the same fix', () => {
  const message = describeFirebaseError(authError('auth/admin-restricted-operation'), { method: 'anonymous' });
  assert.match(message, /enable Anonymous/);
  assert.match(message, /new sign-ups are allowed/);
});

test('auth/unauthorized-domain says which domain to authorize and where', () => {
  const message = describeFirebaseError(authError('auth/unauthorized-domain'), { hostname: 'psd-gaming-git-fix.vercel.app' });
  assert.match(message, /psd-gaming-git-fix\.vercel\.app/);
  assert.match(message, /Authentication → Settings → Authorized domains/);
  assert.match(describeFirebaseError(authError('auth/unauthorized-domain')), /Authorized domains/);
});

test('auth/network-request-failed: offline vs. online wording', () => {
  const error = authError('auth/network-request-failed');
  assert.match(describeFirebaseError(error, { online: false }), /appear to be offline/);
  const online = describeFirebaseError(error, { online: true });
  assert.match(online, /Could not reach Firebase/);
  assert.match(online, /googleapis\.com/);
});

test('Firestore permission-denied explains rules + Anonymous sign-in, for both code spellings', () => {
  for (const error of [firestoreError('permission-denied'), Object.assign(new Error('nope'), { code: 'firestore/permission-denied' })]) {
    const message = describeFirebaseError(error);
    assert.match(message, /permission-denied/);
    assert.match(message, /firestore\.rules/);
    assert.match(message, /Firestore Database → Rules/);
    assert.match(message, /Anonymous/);
  }
});

test('permission-denied caused by a disabled Firestore API is identified as such', () => {
  const error = firestoreError('permission-denied', 'Cloud Firestore API has not been used in project demo before or it is disabled.');
  assert.match(describeFirebaseError(error), /Cloud Firestore is not enabled.*Create the database/s);
});

test('other Firestore codes get plain-language messages', () => {
  assert.match(describeFirebaseError(firestoreError('unauthenticated')), /not signed in/);
  assert.match(describeFirebaseError(firestoreError('unavailable')), /temporarily unavailable or unreachable/);
  assert.match(describeFirebaseError(firestoreError('unavailable'), { online: false }), /appear to be offline/);
  assert.match(describeFirebaseError(firestoreError('deadline-exceeded')), /too long to respond/);
  assert.match(describeFirebaseError(firestoreError('resource-exhausted')), /quota/);
});

test('API key and project setup problems say what to change', () => {
  assert.match(describeFirebaseError(authError('auth/invalid-api-key')), /API key in VITE_FIREBASE_CONFIG.*redeploy/s);
  assert.match(describeFirebaseError(authError('auth/api-key-not-valid.-please-pass-a-valid-api-key.')), /API key in VITE_FIREBASE_CONFIG/);
  assert.match(describeFirebaseError(authError('auth/configuration-not-found')), /Authentication.*Get started/);
  assert.match(describeFirebaseError(authError('auth/app-not-authorized')), /API key/);
  assert.match(describeFirebaseError(authError('auth/web-storage-unsupported')), /storage/);
  assert.match(describeFirebaseError(authError('auth/too-many-requests')), /Too many attempts/);
  // Google's sign-in script (apis.google.com) being blocked surfaces as auth/internal-error in the SDK.
  assert.match(describeFirebaseError(authError('auth/internal-error')), /internal error.*apis\.google\.com.*blocker/s);
});

test('the existing sign-in messages are unchanged', () => {
  const expected = {
    'auth/invalid-credential': 'That sign-in did not match an existing account.',
    'auth/wrong-password': 'That email and password combination did not match.',
    'auth/user-not-found': 'No account was found for that email yet.',
    'auth/email-already-in-use': 'That email is already registered. Try signing in instead.',
    'auth/weak-password': 'Choose a password with at least 6 characters.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/popup-blocked': 'Your browser blocked the Google popup. We’ll continue with a secure redirect instead.',
    'auth/popup-closed-by-user': 'The Google sign-in window was closed before sign-in finished.',
    'auth/cancelled-popup-request': 'The Google sign-in was cancelled. Try again when you are ready.',
    'auth/credential-already-in-use': 'That Google account is already connected to another PSD-gaming account. You can sign in to that account without deleting this guest account.',
    'auth/account-exists-with-different-credential': 'An account already exists for that email with another sign-in method. Sign in with that method first.',
  };
  for (const [code, message] of Object.entries(expected)) assert.equal(describeFirebaseError(authError(code)), message, code);
});

test('context attached where the error is thrown is used later (and call-time context wins)', () => {
  const error = withErrorContext(authError('auth/operation-not-allowed'), { method: 'anonymous' });
  assert.match(describeFirebaseError(error), /Guest play needs Anonymous/);
  assert.match(describeFirebaseError(error, { method: 'google' }), /Google sign-in is not enabled/);
  assert.equal(withErrorContext(null, { method: 'x' }), null, 'non-objects pass through untouched');
  assert.equal(Object.keys(error).includes('method'), false, 'the error object itself is not mutated');
});

test('unknown Firebase codes, app errors and junk never produce raw SDK text or an empty message', () => {
  assert.match(describeFirebaseError(authError('auth/something-new')), /Firebase returned an error \(auth\/something-new\)/);
  assert.equal(describeFirebaseError(new Error('That username is already taken.')), 'That username is already taken.');
  for (const junk of [undefined, null, {}, 'text', 42, new Error('')]) {
    assert.equal(describeFirebaseError(junk), 'Something went wrong. Please try again.');
  }
});
