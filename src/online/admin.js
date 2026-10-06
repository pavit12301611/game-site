/**
 * The admin studio: reads for the dashboard plus every privileged action an administrator has.
 *
 * Firestore rules are the real gatekeeper - only a UID whose `admins/{uid}` document holds
 * `admin: true` can list rooms, manage players, unlink friends, or grant and revoke access. The
 * client hides the page unless that flag is set, but it never *is* the authorization: every write
 * below still passes through `isAdmin()` in firestore.rules, so an admin flag forged in the
 * browser has no effect on the database.
 *
 * After each action the dashboard re-reads itself, so what you see is always the server's truth
 * rather than an optimistic guess.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { db, firebaseReady } from '../firebase.js';
import { friendlyError } from '../errors.js';
import { isRoomExpired } from '../helpers.js';
import { render } from '../render.js';
import { presenceNow, state } from '../state.js';
import { showToast } from '../ui/toast.js';
import { forgetKnownRoom } from './rooms.js';
import { callBackend } from './callables.js';

/**
 * `db` is null only when Firebase never started; every export below is guarded by `state.isAdmin`,
 * which can only be true after a successful Firebase sign-in, so the cast matches those guards.
 */
const store = /** @type {import('firebase/firestore').Firestore} */ (db);

/** Every row the UI shows is the document plus its id. */
function rowsOf(snapshot) {
  return /** @type {Array<Record<string, any>>} */ (snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
}

/**
 * Delete rooms older than 1 hour (with their presence heartbeats) and any game invites pointing to
 * them. Runs automatically whenever the admin dashboard loads.
 * @param {Array<Record<string, any>>} expiredRooms
 */
export async function purgeExpiredAdminRooms(expiredRooms) {
  // Deleting expired data is the backend's job (the scheduled `cleanupExpired` function removes
  // rooms with their secrets, views and heartbeats, plus the invites that point at them, every
  // 15 minutes). Opening the dashboard also asks the backend to close anything already past its
  // hour, so an operator sees tidier numbers immediately. This is best-effort: a failure here must
  // never break the dashboard.
  await Promise.all(expiredRooms.map(async (room) => {
    try {
      forgetKnownRoom(room.id);
      await callBackend('adminRoomAction', { roomId: room.id, action: 'close' });
    } catch (error) {
      console.warn('[PSD-gaming] Expired room cleanup failed:', /** @type {any} */ (error)?.message);
    }
  }));
}

export async function loadAdminData() {
  if (!firebaseReady || !state.isAdmin || !state.user) return;
  state.adminLoading = true;
  render();
  try {
    const [roomsSnap, profilesSnap, adminsSnap, friendshipsSnap, requestsSnap, invitesSnap, reviewsSnap, reviewAnnotationsSnap, reviewAgentModelSnap] = await Promise.all([
      getDocs(query(collection(store, 'rooms'), orderBy('createdAt', 'desc'), limit(100))),
      getDocs(query(collection(store, 'profiles'), limit(300))),
      getDocs(query(collection(store, 'admins'), limit(100))),
      getDocs(query(collection(store, 'friendships'), limit(300))),
      getDocs(query(collection(store, 'friendRequests'), limit(300))),
      getDocs(query(collection(store, 'gameInvites'), limit(300))),
      getDocs(query(collection(store, 'reviews'), orderBy('createdAtMs', 'desc'), limit(300))),
      getDocs(query(collection(store, 'reviewAnnotations'), orderBy('createdAtMs', 'desc'), limit(500))),
      getDoc(doc(store, 'reviewAgentModels', 'active')),
    ]);
    const allRooms = rowsOf(roomsSnap);
    const allInvites = rowsOf(invitesSnap);
    const nowMs = presenceNow();
    const expiredRooms = allRooms.filter((room) => isRoomExpired(room, nowMs));
    const activeRooms = allRooms.filter((room) => !isRoomExpired(room, nowMs));
    const expiredRoomIds = new Set(expiredRooms.map((room) => room.id));
    const activeInvites = allInvites.filter((invite) => !expiredRoomIds.has(invite.roomId) && !isRoomExpired(invite, nowMs));
    // Expired invites are filtered out of the dashboard; deleting them (and the rooms they point
    // at) is the scheduled backend cleanup's job, not a browser's.
    if (expiredRooms.length) await purgeExpiredAdminRooms(expiredRooms);
    state.adminData = {
      rooms: activeRooms,
      profiles: rowsOf(profilesSnap),
      admins: rowsOf(adminsSnap),
      friendships: rowsOf(friendshipsSnap),
      requests: rowsOf(requestsSnap),
      invites: activeInvites,
      reviews: rowsOf(reviewsSnap),
      reviewAnnotations: rowsOf(reviewAnnotationsSnap),
      reviewAgentModel: reviewAgentModelSnap.exists() ? reviewAgentModelSnap.data() : null,
      error: '',
    };
  } catch (error) {
    state.adminData = { error: friendlyError(error), rooms: [], profiles: [], admins: [], friendships: [], requests: [], invites: [], reviews: [], reviewAnnotations: [], reviewAgentModel: null };
  }
  state.adminLoading = false;
  render();
}

/** Runs one privileged action, then re-reads the dashboard so the tables match the server. */
async function runAdminAction(successMessage, task) {
  try {
    await task();
    showToast(successMessage);
  } catch (error) {
    showToast(friendlyError(error), 'warning');
    return;
  }
  await loadAdminData();
}

/**
 * Delete a whole room, including every presence heartbeat under it. Nobody can do this but an
 * admin (rules: `allow delete ... isAdmin()`), and the heartbeats must go first because deleting
 * the room document alone would leave them behind as litter.
 * @param {string} roomId
 */
export async function adminDeleteRoom(roomId) {
  await runAdminAction('Room closed for everyone.', async () => {
    forgetKnownRoom(roomId);
    await callBackend('adminRoomAction', { roomId, action: 'close' });
  });
}

/**
 * Kick any player out of a waiting lobby. The backend releases the seat, rebuilds the lobby state
 * for the remaining players and transfers the host if the host was the one asked to leave.
 * @param {string} roomId
 * @param {string} uid
 */
export async function adminKickPlayer(roomId, uid) {
  await runAdminAction('Player removed from the lobby.', async () => {
    await callBackend('adminRoomAction', { roomId, action: 'kick', uid });
  });
}

/**
 * Remove a player entirely: their profile and their claimed username (which frees the name) go in
 * one backend call, and their admin flag goes with them unless that would lock the caller out.
 * The Authentication record stays; without a profile they sign in as a plain guest.
 * @param {string} uid
 */
export async function adminRemovePlayer(uid) {
  await runAdminAction('Player removed. Their username is free again.', async () => {
    await callBackend('adminRemovePlayer', { uid });
  });
}

/** @param {string} uid */
export async function adminGrantAccess(uid) {
  await runAdminAction('Admin access granted. They can open the admin studio on next refresh.', async () => {
    const cleanUid = String(uid || '').trim();
    if (!cleanUid) throw new Error('Paste a user UID first.');
    await setDoc(doc(store, 'admins', cleanUid), { admin: true });
  });
}

/** @param {string} uid */
export async function adminRevokeAccess(uid) {
  await runAdminAction('Admin access revoked.', async () => {
    if (uid === state.user?.uid) throw new Error('You cannot revoke your own flag - another admin or the Firebase console has to.');
    await deleteDoc(doc(store, 'admins', uid));
  });
}

/** @param {string} friendshipId */
export async function adminDeleteFriendship(friendshipId) {
  await runAdminAction('Friend link removed.', async () => {
    await deleteDoc(doc(store, 'friendships', friendshipId));
  });
}

/** @param {string} requestId */
export async function adminDeleteFriendRequest(requestId) {
  await runAdminAction('Friend request deleted.', async () => {
    await deleteDoc(doc(store, 'friendRequests', requestId));
  });
}

/** @param {string} inviteId */
export async function adminDeleteGameInvite(inviteId) {
  await runAdminAction('Game invite deleted.', async () => {
    await deleteDoc(doc(store, 'gameInvites', inviteId));
  });
}

/** @param {string} reviewId @param {string} sentiment */
export async function adminLabelReview(reviewId, sentiment) {
  await runAdminAction('Human training label saved. Retrain the local agent when enough examples are ready.', async () => {
    await callBackend('adminLabelReview', { reviewId, sentiment });
  });
}

export async function adminTrainReviewAgent() {
  try {
    const result = await callBackend('adminTrainReviewAgent');
    showToast(`Review agent distilled from ${Number(result.trainingSize) || 0} real reviews (${Number(result.vocabularySize) || 0} compact word weights).`, 'success');
  } catch (error) {
    showToast(friendlyError(error), 'warning');
    return;
  }
  await loadAdminData();
}
