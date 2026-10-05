/**
 * Accounts: guests, email/password, Google, and the username that makes someone findable.
 *
 * Three things are worth knowing:
 *
 * - Guests are anonymous Firebase accounts. Nothing here forces a sign-up: a guest can join a room
 *   by link, and can later link Google and keep the same UID.
 * - A username is claimed in one transaction that writes `usernames/{lower}` and `profiles/{uid}`
 *   together, so two people can never end up with the same name.
 * - Google popup is tried first and falls back to a redirect when popups are blocked (mobile,
 *   in-app browsers). The "already in use" case is a dialog, never a silent overwrite.
 *
 * This module sits above the session, the rooms, the social listeners and the router: after a
 * sign-in it refreshes the profile, re-subscribes the friend listeners, and re-opens a room if the
 * current hash is an invite link.
 */

import { getRedirectResult, linkWithPopup, linkWithRedirect, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, createGoogleProvider, db, firebaseReady } from './firebase.js';
import { setupError } from './connection.js';
import { friendlyError } from './errors.js';
import { render } from './render.js';
import { navigate, parseHash } from './router.js';
import { state } from './state.js';
import { showToast } from './ui/toast.js';
import { isGoogleUser } from './ui/players.js';
import { stopSocial, subscribeSocial } from './social.js';
import { callBackend } from './online/callables.js';
import { openRoomFromLink, sweepExpiredKnownRooms } from './online/rooms.js';
import { DISPLAY_NAME_STORAGE_KEY, suggestUsername, validateUsername } from './helpers.js';

/**
 * `db` and `auth` are null only when Firebase never started; every path here is guarded by
 * `firebaseReady` (or by a sign-in that can only happen once Firebase is up), so these casts match
 * what those guards already guarantee.
 */
const store = /** @type {import('firebase/firestore').Firestore} */ (db);
const authInstance = /** @type {import('firebase/auth').Auth} */ (auth);

export async function finishGoogleAuthentication(user, successMessage = 'Google sign-in confirmed.') {
  state.user = user;
  state.authError = '';
  await refreshAccount(user);
  if (state.profile) {
    state.modal = null;
    showToast(successMessage);
  } else if (isGoogleUser(user)) {
    state.modal = {
      type: 'username',
      suggestion: suggestUsername(user.displayName, user.email),
    };
    render();
  }
}

export async function redirectGoogleSignIn({ linkGuest = false } = {}) {
  const provider = createGoogleProvider();
  state.authError = '';
  showToast('Opening Google sign-in…', 'success');
  if (linkGuest && authInstance.currentUser?.isAnonymous) {
    await linkWithRedirect(authInstance.currentUser, provider);
  } else {
    await signInWithRedirect(authInstance, provider);
  }
}

export async function handleGoogleSignIn({ forceExistingAccount = false } = {}) {
  if (!firebaseReady) throw setupError();
  state.authError = '';
  const current = authInstance.currentUser || state.user;
  const shouldLink = !forceExistingAccount && Boolean(current?.isAnonymous);
  const provider = createGoogleProvider();
  try {
    const result = shouldLink
      ? await linkWithPopup(current, provider)
      : await signInWithPopup(authInstance, provider);
    await finishGoogleAuthentication(result.user, shouldLink ? 'Google linked — your guest identity is preserved.' : 'Welcome to the arcade with Google.');
  } catch (error) {
    if (/** @type {any} */ (error)?.code === 'auth/credential-already-in-use') {
      state.modal = { type: 'google-conflict' };
      render();
      return;
    }
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(/** @type {any} */ (error)?.code)) {
      await redirectGoogleSignIn({ linkGuest: shouldLink });
      return;
    }
    throw error;
  }
}

export async function processGoogleRedirect() {
  if (!firebaseReady || state.redirectChecked) return;
  state.redirectChecked = true;
  try {
    const result = await getRedirectResult(authInstance);
    if (result?.user) {
      await finishGoogleAuthentication(result.user, 'Google sign-in confirmed.');
    }
  } catch (error) {
    if (/** @type {any} */ (error)?.code === 'auth/credential-already-in-use') {
      state.modal = { type: 'google-conflict' };
      render();
    } else if (/** @type {any} */ (error)?.code !== 'auth/popup-closed-by-user') {
      // Firebase only touches the network here when a sign-in redirect was actually pending, so this error
      // belongs to that sign-in attempt: keep it for the sign-in dialog as well as showing a toast.
      state.authError = friendlyError(error, { method: 'google' });
      showToast(state.authError, 'warning');
    }
  }
}

export async function registerProfile(user, rawUsername) {
  const validation = validateUsername(rawUsername);
  if (!validation.ok) throw new Error(validation.error);
  const { username, usernameLower } = validation;
  // The claim is one transaction on the trusted backend (`claimUsername`): the reservation document
  // and the profile are written together, nobody can win a race for a name, and profiles are not
  // client-writable any more (see firestore.rules).
  await callBackend('claimUsername', { username });
  state.profile = { uid: user.uid, username, usernameLower };
  state.displayName = username;
  localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, username);
  await refreshAdminStatus(user);
  subscribeSocial(user);
}

/**
 * Self-service account deletion.
 *
 * The backend does the deleting (profile, username reservation, friendships, requests, invites,
 * presence, eligible rooms, then the Firebase Auth user) and refuses when it cannot: the single
 * admin account is told to promote someone first, and a sign-in older than ten minutes is told to
 * sign in again. Nothing here claims success unless the backend confirmed it, and only then does the
 * browser sign out.
 *
 * @returns {Promise<Record<string, any>>} the backend's summary of what was removed
 */
export async function deleteAccountNow() {
  if (!firebaseReady || !state.user) throw setupError();
  // Refresh the ID token first: `auth_time` is what the backend's recent-login rule reads, and a
  // long-lived tab would otherwise be rejected without the player understanding why.
  try {
    await authInstance.currentUser?.getIdToken(true);
  } catch (error) {
    console.warn('[PSD-gaming] Could not refresh the sign-in before deletion:', /** @type {any} */ (error)?.message);
  }
  const result = await callBackend('deleteAccount', { confirm: true });
  stopSocial();
  state.modal = null;
  state.local = null;
  try {
    await authInstance.signOut();
  } catch (error) {
    console.warn('[PSD-gaming] Account deleted but the local sign-out failed:', /** @type {any} */ (error)?.message);
  }
  return result;
}

export async function refreshAdminStatus(user) {
  state.isAdmin = false;
  if (!user || user.isAnonymous || !firebaseReady) return;
  try {
    const adminSnap = await getDoc(doc(store, 'admins', user.uid));
    state.isAdmin = adminSnap.exists() && adminSnap.data().admin === true;
  } catch (error) {
    console.warn('[PSD-gaming] Admin lookup was denied:', /** @type {any} */ (error)?.message);
  }
}

export async function refreshAccount(user) {
  state.user = user;
  state.profile = null;
  state.isAdmin = false;
  state.requests = [];
  state.friends = [];
  state.invites = [];
  state.socialError = '';
  stopSocial();
  if (user && !user.isAnonymous && firebaseReady) {
    try {
      const profileSnap = await getDoc(doc(store, 'profiles', user.uid));
      if (profileSnap.exists()) {
        state.profile = profileSnap.data();
      } else if (isGoogleUser(user) && (!state.modal || state.modal.type === 'auth')) {
        state.modal = {
          type: 'username',
          suggestion: suggestUsername(user.displayName, user.email),
        };
      }
      await refreshAdminStatus(user);
      subscribeSocial(user);
    } catch (error) {
      console.warn('[PSD-gaming] Account profile could not be loaded:', /** @type {any} */ (error)?.message);
      state.socialError = `Your profile and friends could not be loaded. ${friendlyError(error)}`;
    }
  }
  render();
  if (state.socialError) showToast(state.socialError, 'warning');
  if (state.page === 'admin' && !state.isAdmin) navigate('home');
  if (user && firebaseReady) void sweepExpiredKnownRooms();
  const route = parseHash();
  if (route.page === 'room' && route.id && user) void openRoomFromLink(route.id);
}
