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
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, firebaseReady } from '../firebase.js';
import { createInitialGameState } from '../catalog.js';
import { friendlyError } from '../errors.js';
import { isRoomExpired } from '../helpers.js';
import { render } from '../render.js';
import { presenceNow, state } from '../state.js';
import { showToast } from '../ui/toast.js';
import { forgetKnownRoom } from './rooms.js';

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
 * @param {Array<Record<string, any>>} [expiredInvites]
 */
export async function purgeExpiredAdminRooms(expiredRooms, expiredInvites = []) {
  await Promise.all(expiredRooms.map(async (room) => {
    try {
      forgetKnownRoom(room.id);
      const presenceSnap = await getDocs(collection(store, 'rooms', room.id, 'presence'));
      const batch = writeBatch(store);
      for (const heartbeat of presenceSnap.docs) batch.delete(heartbeat.ref);
      batch.delete(doc(store, 'rooms', room.id));
      await batch.commit();
    } catch (error) {
      console.warn('[PSD-gaming] Expired room cleanup failed:', /** @type {any} */ (error)?.message);
    }
  }));
  await Promise.all(expiredInvites.map(async (invite) => {
    try {
      await deleteDoc(doc(store, 'gameInvites', invite.id));
    } catch (error) {
      console.warn('[PSD-gaming] Expired game invite cleanup failed:', /** @type {any} */ (error)?.message);
    }
  }));
}

export async function loadAdminData() {
  if (!firebaseReady || !state.isAdmin || !state.user) return;
  state.adminLoading = true;
  render();
  try {
    const [roomsSnap, profilesSnap, adminsSnap, friendshipsSnap, requestsSnap, invitesSnap] = await Promise.all([
      getDocs(query(collection(store, 'rooms'), orderBy('createdAt', 'desc'), limit(100))),
      getDocs(query(collection(store, 'profiles'), limit(300))),
      getDocs(query(collection(store, 'admins'), limit(100))),
      getDocs(query(collection(store, 'friendships'), limit(300))),
      getDocs(query(collection(store, 'friendRequests'), limit(300))),
      getDocs(query(collection(store, 'gameInvites'), limit(300))),
    ]);
    const allRooms = rowsOf(roomsSnap);
    const allInvites = rowsOf(invitesSnap);
    const nowMs = presenceNow();
    const expiredRooms = allRooms.filter((room) => isRoomExpired(room, nowMs));
    const activeRooms = allRooms.filter((room) => !isRoomExpired(room, nowMs));
    const expiredRoomIds = new Set(expiredRooms.map((room) => room.id));
    const expiredInvites = allInvites.filter((invite) => expiredRoomIds.has(invite.roomId) || isRoomExpired(invite, nowMs));
    const activeInvites = allInvites.filter((invite) => !expiredRoomIds.has(invite.roomId) && !isRoomExpired(invite, nowMs));
    if (expiredRooms.length || expiredInvites.length) {
      await purgeExpiredAdminRooms(expiredRooms, expiredInvites);
    }
    state.adminData = {
      rooms: activeRooms,
      profiles: rowsOf(profilesSnap),
      admins: rowsOf(adminsSnap),
      friendships: rowsOf(friendshipsSnap),
      requests: rowsOf(requestsSnap),
      invites: activeInvites,
      error: '',
    };
  } catch (error) {
    state.adminData = { error: friendlyError(error), rooms: [], profiles: [], admins: [], friendships: [], requests: [], invites: [] };
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
  await runAdminAction('Room and its heartbeats deleted.', async () => {
    forgetKnownRoom(roomId);
    const presenceSnap = await getDocs(collection(store, 'rooms', roomId, 'presence'));
    const batch = writeBatch(store);
    for (const heartbeat of presenceSnap.docs) batch.delete(heartbeat.ref);
    batch.delete(doc(store, 'rooms', roomId));
    await batch.commit();
  });
}

/**
 * Kick any player out of a waiting lobby. The seat is released (hosting transfers if the host was
 * the one kicked), their heartbeat goes with them, and the lobby game state is rebuilt for the
 * remaining players - the same shape `leaveWaitingRoom` writes, just for someone else's uid.
 * @param {string} roomId
 * @param {string} uid
 */
export async function adminKickPlayer(roomId, uid) {
  await runAdminAction('Player removed from the lobby.', async () => {
    const roomRef = doc(store, 'rooms', roomId);
    await runTransaction(store, async (transaction) => {
      const snapshot = await transaction.get(roomRef);
      if (!snapshot.exists()) throw new Error('That room no longer exists.');
      const current = snapshot.data();
      if (current.status !== 'waiting') throw new Error('Kicks work while the room is waiting. For a running match, delete the room.');
      const currentUids = current.playerUids || [];
      const uids = currentUids.filter((member) => member !== uid);
      if (uids.length === currentUids.length) return; // they already left
      transaction.delete(doc(store, 'rooms', roomId, 'presence', uid));
      if (!uids.length) {
        transaction.delete(roomRef);
        return;
      }
      const playerNames = { ...(current.playerNames || {}) };
      delete playerNames[uid];
      const players = uids.map((member) => ({ uid: member, name: playerNames[member] || 'Player' }));
      const update = {
        playerUids: uids,
        playerNames,
        state: createInitialGameState(current.gameId, players, roomId),
        updatedAt: serverTimestamp(),
      };
      // A kicked host cannot leave the room leader-less: the next seat becomes the host.
      if (current.hostUid === uid) {
        update.hostUid = uids[0];
        update.hostName = playerNames[uids[0]] || 'Player';
      }
      transaction.update(roomRef, update);
    });
  });
}

/**
 * Remove a player entirely: their profile, their claimed username (which frees the name), and -
 * unless they would lock the caller out - their admin flag. The Authentication record stays;
 * without a profile they can sign in but are a plain guest for friend features.
 * @param {string} uid
 * @param {string} usernameLower
 */
export async function adminRemovePlayer(uid, usernameLower) {
  await runAdminAction('Player removed. Their username is free again.', async () => {
    if (!/^[a-z0-9_]{3,18}$/.test(usernameLower || '')) throw new Error('This profile has no valid username to free.');
    const batch = writeBatch(store);
    batch.delete(doc(store, 'profiles', uid));
    batch.delete(doc(store, 'usernames', usernameLower));
    if (uid !== state.user?.uid) batch.delete(doc(store, 'admins', uid));
    await batch.commit();
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
