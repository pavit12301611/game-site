/**
 * Turns Firebase Auth / Firestore errors into messages a person can act on.
 *
 * Pure module (no SDK import, no DOM) so it can be unit-tested with real `FirebaseError`
 * and `FirestoreError` instances. Nothing here changes behaviour; it only words the error.
 */

const errorContexts = new WeakMap();

/**
 * Attaches context that only the throw site knows (for example which sign-in method was being
 * used) to an error object without mutating it. `describeFirebaseError` picks it up later.
 */
export function withErrorContext(error, context) {
  if (error && typeof error === 'object') {
    errorContexts.set(error, { ...errorContexts.get(error), ...context });
  }
  return error;
}

/** Firestore codes are plain ('permission-denied'); some SDK paths prefix them with 'firestore/'. */
export function getFirebaseErrorCode(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  return code.startsWith('firestore/') ? code.slice('firestore/'.length) : code;
}

const SIGN_IN_METHOD_DISABLED = {
  google: 'Google sign-in is not enabled for this Firebase project. In Firebase Console → Authentication → Sign-in method, enable Google and choose a project support email.',
  password: 'Email/Password sign-in is not enabled for this Firebase project. In Firebase Console → Authentication → Sign-in method, enable Email/Password.',
  anonymous: 'Guest play needs Anonymous sign-in, which is not enabled for this Firebase project. In Firebase Console → Authentication → Sign-in method, enable Anonymous.',
};
const ANY_SIGN_IN_METHOD_DISABLED = 'This sign-in method is not enabled for this Firebase project. In Firebase Console → Authentication → Sign-in method, enable Anonymous, Email/Password and Google.';
const OFFLINE_MESSAGE = 'You appear to be offline. Reconnect and try again; local practice is still available.';

/** Messages that do not depend on the context. */
const STATIC_MESSAGES = {
  'auth/invalid-credential': 'That sign-in did not match an existing account.',
  'auth/wrong-password': 'That email and password combination did not match.',
  'auth/user-not-found': 'No account was found for that email yet.',
  'auth/email-already-in-use': 'That email is already registered. Try signing in instead.',
  'auth/weak-password': 'Choose a password with at least 6 characters.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled. Contact the arcade owner.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes, then try again.',
  'auth/popup-blocked': 'Your browser blocked the Google popup. We’ll continue with a secure redirect instead.',
  'auth/popup-closed-by-user': 'The Google sign-in window was closed before sign-in finished.',
  'auth/cancelled-popup-request': 'The Google sign-in was cancelled. Try again when you are ready.',
  'auth/credential-already-in-use': 'That Google account is already connected to another PSD-gaming account. You can sign in to that account without deleting this guest account.',
  'auth/account-exists-with-different-credential': 'An account already exists for that email with another sign-in method. Sign in with that method first.',
  'auth/provider-already-linked': 'That sign-in method is already linked to this account.',
  'auth/configuration-not-found': 'Firebase Authentication is not set up for this project yet. Open Firebase Console → Authentication and choose Get started.',
  'auth/app-not-authorized': 'Firebase rejected this site for the configured API key. Check the key’s website (HTTP referrer) restrictions in Google Cloud Console → APIs & Services → Credentials.',
  'auth/web-storage-unsupported': 'This browser is blocking the storage Firebase sign-in needs (private mode or blocked cookies). Allow site data or try another browser.',
  'auth/operation-not-supported-in-this-environment': 'This browser cannot run that sign-in flow here. Allow site data and popups, or try another browser.',
  'auth/internal-error': 'Firebase reported an internal error. Try again in a moment. If it keeps happening, allow apis.google.com and *.firebaseapp.com in any ad or privacy blocker.',
  unauthenticated: 'You are not signed in. Reload the page, or sign in (or continue as a guest) and try again.',
  'deadline-exceeded': 'Firebase took too long to respond. Try again.',
  'resource-exhausted': 'This Firebase project has reached its usage quota. Try again later.',
};

const INVALID_API_KEY = 'Firebase rejected the API key in VITE_FIREBASE_API_KEY. Copy the Web app config again from Firebase Console → Project settings → Your apps, update the variable in Vercel, and redeploy.';

/**
 * @param {unknown} error  anything thrown by the Firebase SDK (or by app code)
 * @param {{ online?: boolean, hostname?: string, method?: 'google' | 'password' | 'anonymous' }} [context]
 * @returns {string} a message that is safe to show in the UI
 */
export function describeFirebaseError(error, context = {}) {
  const tagged = error && typeof error === 'object' ? errorContexts.get(error) : null;
  const { online = true, hostname = '', method = '' } = { ...tagged, ...context };
  const code = getFirebaseErrorCode(error);
  const rawMessage = typeof /** @type {any} */ (error)?.message === 'string' ? /** @type {any} */ (error).message : '';

  if (!online && ['unavailable', 'deadline-exceeded', 'auth/network-request-failed'].includes(code)) {
    return OFFLINE_MESSAGE;
  }

  switch (code) {
    case 'auth/operation-not-allowed':
      return SIGN_IN_METHOD_DISABLED[method] || ANY_SIGN_IN_METHOD_DISABLED;
    case 'auth/admin-restricted-operation':
      // Firebase answers with this code when a provider (notably Anonymous) is switched off,
      // and also when new sign-ups are restricted for the project.
      return `${SIGN_IN_METHOD_DISABLED[method] || ANY_SIGN_IN_METHOD_DISABLED} If it is already enabled, check that new sign-ups are allowed (Authentication → Settings → User actions).`;
    case 'auth/unauthorized-domain':
      return hostname
        ? `This site (${hostname}) is not an authorized domain for Firebase sign-in. Add ${hostname} in Firebase Console → Authentication → Settings → Authorized domains, then try again.`
        : 'This domain is not authorized for Firebase sign-in. Add it in Firebase Console → Authentication → Settings → Authorized domains, then try again.';
    case 'auth/network-request-failed':
      return 'Could not reach Firebase. Check your connection, VPN or content blocker (it must allow *.googleapis.com and *.firebaseapp.com), then try again.';
    case 'auth/invalid-api-key':
      return INVALID_API_KEY;
    case 'permission-denied':
      if (/has not been used|is disabled|SERVICE_DISABLED/i.test(rawMessage)) {
        return 'Cloud Firestore is not enabled for this Firebase project. Create the database in Firebase Console → Firestore Database, then try again.';
      }
      return 'Firebase denied this action (permission-denied). Owner: publish firestore.rules under Firebase Console → Firestore Database → Rules, and enable Anonymous sign-in. Player: reload, sign in again, or ask the host for a fresh invite.';
    case 'unavailable':
      return 'Firebase is temporarily unavailable or unreachable. Check your connection and try again.';
    default:
      break;
  }

  if (code.startsWith('auth/api-key-not-valid')) return INVALID_API_KEY;
  if (STATIC_MESSAGES[code]) return STATIC_MESSAGES[code];

  // A Firebase error with no dedicated wording: say so plainly instead of showing the SDK's
  // "Firebase: Error (auth/xyz)." text. App-level Errors keep their own (already friendly) message.
  if (/** @type {any} */ (error)?.name === 'FirebaseError' && code) {
    return `Firebase returned an error (${code}). Try again; the browser console has more detail.`;
  }
  return rawMessage || 'Something went wrong. Please try again.';
}
