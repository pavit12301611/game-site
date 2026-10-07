/**
 * Account management: sign-in, registration, profile, username claim, admin flag.
 */

import { auth, db, firebaseReady, createGoogleProvider } from './firebase.js';
import { state } from './state.js';
import { render } from './render.js';
import { showToast } from './ui/toast.js';
import { friendlyError } from './errors.js';
import { validateUsername } from './helpers.js';
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  linkWithPopup,
  signInAnonymously,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

/**
 * Ensures the user has an account (anonymous if needed for guest play).
 */
export async function ensureOnlineUser() {
  if (!firebaseReady) throw new Error('Firebase is not configured.');
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
}

/**
 * Processes a Google redirect result on startup.
 */
export async function processGoogleRedirect() {
  if (!firebaseReady) return;
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      await refreshAccount(result.user);
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Refreshes the account state from Firestore after sign-in.
 */
export async function refreshAccount(user) {
  state.user = user || null;
  state.profile = null;
  state.isAdmin = false;

  if (!user || !firebaseReady) {
    render();
    return;
  }

  try {
    const profileDoc = await getDoc(doc(db, 'profiles', user.uid));
    if (profileDoc.exists()) {
      state.profile = profileDoc.data();
    }

    const adminDoc = await getDoc(doc(db, 'admins', user.uid));
    state.isAdmin = adminDoc.exists() && adminDoc.data()?.admin === true;
  } catch (error) {
    console.error('[PSD-gaming] Could not load profile:', error);
  }

  render();
}

/**
 * Registers a profile and claims a username atomically.
 */
export async function registerProfile(user, username) {
  if (!firebaseReady || !user) throw new Error('Sign in first.');
  const validation = validateUsername(username);
  if (!validation.ok) throw new Error(validation.reason);

  const usernameLower = username.toLowerCase();

  // Check if username is available
  const usernameDoc = await getDoc(doc(db, 'usernames', usernameLower));
  if (usernameDoc.exists()) {
    const existing = usernameDoc.data();
    if (existing?.uid !== user.uid) throw new Error('That username is taken.');
  }

  // Claim username and create profile
  await setDoc(doc(db, 'usernames', usernameLower), {
    uid: user.uid,
    claimedAt: serverTimestamp(),
  });

  await setDoc(doc(db, 'profiles', user.uid), {
    username,
    usernameLower,
    displayName: username,
    createdAt: serverTimestamp(),
  });

  state.profile = { username, usernameLower, displayName: username };
  showToast(`Welcome, @${username}. Friend features are ready.`);
}

/**
 * Handles Google sign-in.
 */
export async function handleGoogleSignIn(options = {}) {
  if (!firebaseReady) throw new Error('Firebase is not configured.');
  const provider = createGoogleProvider();
  const current = auth.currentUser;

  if (current?.isAnonymous && !options.forceExistingAccount) {
    try {
      await linkWithPopup(current, provider);
      await refreshAccount(current);
      return;
    } catch (error) {
      if (error?.code === 'auth/credential-already-in-use') {
        state.authError = 'That Google account is already linked to another user. Sign in to that account instead.';
        render();
        return;
      }
      throw error;
    }
  }

  await signInWithPopup(auth, provider).catch(async (error) => {
    if (error?.code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw error;
  });
  await refreshAccount(auth.currentUser);
}

/**
 * Deletes the current account and all associated data.
 */
export async function deleteAccountNow() {
  if (!firebaseReady || !state.user) throw new Error('Sign in first.');
  const { deleteAccount: deleteAccountCallable } = await import('./online/callables.js');
  const result = await deleteAccountCallable();
  await auth.currentUser?.delete();
  state.user = null;
  state.profile = null;
  state.isAdmin = false;
  return result;
}