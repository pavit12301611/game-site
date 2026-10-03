/**
 * Friends: find someone by username, send and answer a request, and keep three live lists
 * (incoming requests, accepted friends, game invites) in sync with Firestore.
 *
 * The lists are Firestore listeners that write straight into `state` and ask for a repaint, so the
 * friends page and the notification badge always show the same truth. A listener error never takes
 * the page down: it becomes a single warning panel (`state.socialError`) and the rest of the app
 * keeps working.
 *
 * The rules are what make this safe: a friendship can only be created in the same batch that
 * accepts the request that produced it, and an invite requires a real friendship plus a room you
 * host. This module only has to write the right shape.
 */

import { collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db, firebaseReady } from './firebase.js';
import { friendlyError } from './errors.js';
import { isRoomExpired } from './helpers.js';
import { deleteExpiredRoom } from './online/rooms.js';
import { unavailableSocialDocument } from './social-errors.js';
import { render } from './render.js';
import { setHash } from './router.js';
import { presenceNow, state } from './state.js';
import { showToast } from './ui/toast.js';

/** A no-op unsubscribe, so the three listeners are always safe to stop. */
const emptyUnsubscribe = () => {};

/**
 * `db` is null only when Firebase never started; every listener here is guarded by
 * `firebaseReady`, so the cast matches what the guards already guarantee.
 */
const store = /** @type {import('firebase/firestore').Firestore} */ (db);

/** Every row the UI shows is the document plus its id. */
function rowsOf(snapshot) {
  return /** @type {Array<Record<string, any>>} */ (snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
}

let stopRequests = emptyUnsubscribe;
let stopFriends = emptyUnsubscribe;
let stopInvites = emptyUnsubscribe;

/** Stops the three social listeners. Safe to call twice, and when they were never started. */
export function stopSocial() {
  stopRequests();
  stopFriends();
  stopInvites();
  stopRequests = emptyUnsubscribe;
  stopFriends = emptyUnsubscribe;
  stopInvites = emptyUnsubscribe;
}

export function subscribeSocial(user) {
  if (!firebaseReady || !user || user.isAnonymous) return;
  stopSocial();
  stopRequests = onSnapshot(query(collection(store, 'friendRequests'), where('toUid', '==', user.uid)), (snapshot) => {
    state.requests = rowsOf(snapshot).filter((row) => row.status === 'pending');
    render();
  }, (error) => reportSocialError('Friend request listener', error));
  stopFriends = onSnapshot(query(collection(store, 'friendships'), where('memberUids', 'array-contains', user.uid)), (snapshot) => {
    state.friends = rowsOf(snapshot);
    render();
  }, (error) => reportSocialError('Friend list listener', error));
  stopInvites = onSnapshot(query(collection(store, 'gameInvites'), where('toUid', '==', user.uid)), (snapshot) => {
    const pending = rowsOf(snapshot).filter((row) => row.status === 'pending');
    const nowMs = presenceNow();
    for (const invite of pending.filter((row) => isRoomExpired(row, nowMs))) {
      void deleteExpiredRoom(invite.roomId, user.uid);
      void deleteDoc(doc(store, 'gameInvites', invite.id)).catch(emptyUnsubscribe);
    }
    state.invites = pending.filter((row) => !isRoomExpired(row, nowMs));
    render();
  }, (error) => reportSocialError('Game invite listener', error));
}

export function reportSocialError(source, error) {
  console.warn(`[PSD-gaming] ${source}:`, error?.message);
  const message = `Friends and invites could not be loaded. ${friendlyError(error)}`;
  if (state.socialError === message) return;
  state.socialError = message;
  render();
}

export function requestFriendSearch(form) {
  if (!state.user || state.user.isAnonymous || !state.profile) throw new Error('Create an account with a username before adding friends.');
  const username = String(new FormData(form).get('username') || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,18}$/.test(username)) throw new Error('Enter a valid 3–18 character username.');
  state.friendSearchTerm = username;
  state.friendResults = [];
  render();
  void (async () => {
    try {
      const results = await getDocs(query(collection(store, 'profiles'), where('usernameLower', '==', username), limit(5)));
      state.friendResults = results.docs.map((item) => item.data()).filter((profile) => profile.uid !== state.user.uid && !state.friends.some((friend) => (friend.memberUids || []).includes(profile.uid)));
      render();
      if (!state.friendResults.length) showToast('No available player found with that username.', 'warning');
    } catch (error) {
      showToast(friendlyError(error), 'warning');
    }
  })();
}

export async function sendFriendRequest(uid, name) {
  if (!state.user || state.user.isAnonymous || !state.profile) throw new Error('Sign in with a username to add friends.');
  await setDoc(doc(collection(store, 'friendRequests')), {
    fromUid: state.user.uid,
    toUid: uid,
    fromName: state.profile.username,
    toName: name,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  state.friendResults = [];
  showToast(`Friend request sent to @${name}.`);
}

export async function respondToFriend(requestId, accepted) {
  if (!state.user || !state.profile) throw new Error('Sign in to manage friend requests.');
  const requestRef = doc(store, 'friendRequests', requestId);
  try {
    const snapshot = await getDoc(requestRef);
    if (!snapshot.exists()) throw new Error('That friend request is no longer available.');
    const request = snapshot.data();
    if (request.toUid !== state.user.uid || request.status !== 'pending') throw new Error('This request can no longer be changed.');
    if (!accepted) {
      await updateDoc(requestRef, { status: 'declined', respondedAt: serverTimestamp() });
      showToast('Friend request declined.');
      return;
    }
    const memberUids = [request.fromUid, request.toUid].sort();
    const friendRef = doc(store, 'friendships', memberUids.join('_'));
    const batch = writeBatch(store);
    batch.update(requestRef, { status: 'accepted', respondedAt: serverTimestamp() });
    batch.set(friendRef, {
      memberUids,
      memberNames: { [request.fromUid]: request.fromName, [request.toUid]: request.toName || state.profile.username },
      requestId,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    showToast(`You and @${request.fromName} are now friends.`);
  } catch (error) {
    throw unavailableSocialDocument(error, 'That friend request is no longer available.');
  }
}

export async function joinGameInvite(inviteId, roomId) {
  const inviteRef = doc(store, 'gameInvites', inviteId);
  try {
    const snapshot = await getDoc(inviteRef);
    if (!snapshot.exists() || snapshot.data().status !== 'pending') throw new Error('This game invite is no longer valid.');
    if (isRoomExpired(snapshot.data(), presenceNow())) {
      await deleteExpiredRoom(roomId, state.user?.uid);
      await deleteDoc(inviteRef).catch(emptyUnsubscribe);
      throw new Error('This game invite has expired.');
    }
    await updateDoc(inviteRef, { status: 'accepted', respondedAt: serverTimestamp() });
    state.modal = null;
    setHash(`room/${roomId}`);
  } catch (error) {
    throw unavailableSocialDocument(error, 'This game invite is no longer valid.');
  }
}
