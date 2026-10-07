/**
 * Admin studio: reads and privileged actions.
 */

import { db, firebaseReady } from '../firebase.js';
import { state } from '../state.js';
import { render } from '../render.js';
import { showToast } from '../ui/toast.js';
import { friendlyError } from '../errors.js';
import * as api from './callables.js';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

/**
 * Loads all admin dashboard data.
 */
export async function loadAdminData() {
  if (!state.isAdmin || !firebaseReady) return;
  state.adminLoading = true;
  render();

  try {
    const [roomsSnap, profilesSnap] = await Promise.all([
      getDocs(query(collection(db, 'rooms'), orderBy('createdAt', 'desc'), limit(50))),
      getDocs(query(collection(db, 'profiles'), orderBy('createdAt', 'desc'), limit(100))),
    ]);

    state.adminData = {
      rooms: roomsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      players: profilesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    };
  } catch (error) {
    showToast(friendlyError(error), 'warning');
  }

  state.adminLoading = false;
  render();
}

export async function adminDeleteRoom(roomId) {
  await api.adminRoomAction({ action: 'delete', roomId });
  showToast('Room deleted.', 'success');
  await loadAdminData();
}

export async function adminKickPlayer(roomId, uid) {
  await api.adminRoomAction({ action: 'kick', roomId, uid });
  showToast('Player kicked.', 'success');
  await loadAdminData();
}

export async function adminRemovePlayer(uid) {
  await api.adminRemovePlayer({ uid });
  showToast('Player removed.', 'success');
  await loadAdminData();
}

export async function adminGrantAccess(uid) {
  const { setDoc, doc } = await import('firebase/firestore');
  await setDoc(doc(db, 'admins', uid), { admin: true }, { merge: true });
  showToast('Admin access granted.', 'success');
  await loadAdminData();
}

export async function adminRevokeAccess(uid) {
  const { deleteDoc, doc } = await import('firebase/firestore');
  await deleteDoc(doc(db, 'admins', uid));
  showToast('Admin access revoked.', 'success');
  await loadAdminData();
}

export async function adminDeleteFriendship(friendshipId) {
  await api.adminRoomAction({ action: 'deleteFriendship', friendshipId });
  showToast('Friendship removed.', 'success');
  await loadAdminData();
}

export async function adminDeleteFriendRequest(requestId) {
  await api.adminRoomAction({ action: 'deleteRequest', requestId });
  showToast('Request deleted.', 'success');
  await loadAdminData();
}

export async function adminDeleteGameInvite(inviteId) {
  await api.adminRoomAction({ action: 'deleteInvite', inviteId });
  showToast('Invite deleted.', 'success');
  await loadAdminData();
}

export async function adminLabelReview(reviewId, label) {
  await api.adminLabelReview({ reviewId, label });
  showToast('Review labeled.', 'success');
}

export async function adminTrainReviewAgent() {
  await api.adminTrainReviewAgent();
  showToast('Agent training started.', 'success');
}