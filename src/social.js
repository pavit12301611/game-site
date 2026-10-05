/**
 * Friends: find someone by username, send and answer a request, and keep three live lists
 * (incoming requests, accepted friends, game invites) in sync with Firestore.
 *
 * Two different mechanisms, deliberately:
 *
 * - **Reads** are Firestore listeners that write straight into `state` and ask for a repaint, so the
 *   friends page and the notification badge always show the same truth. `firestore.rules` scopes each
 *   listener to the caller (`fromUid`/`toUid`/`memberUids`), which is what makes a listener query
 *   safe: it cannot be widened into a directory scan.
 * - **Writes** are callable Cloud Functions (`./online/callables.js`). The backend checks the
 *   friendship, the block list, the rate limits and the room before it writes anything, so a forged
 *   client cannot create a friendship without an accepted request, invite a stranger, or flood
 *   someone's inbox. The client is not writable on these collections at all.
 */

import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, firebaseReady } from './firebase.js';
import { friendlyError } from './errors.js';
import { isRoomExpired } from './helpers.js';
import { callBackend } from './online/callables.js';
import { forgetKnownRoom } from './online/rooms.js';
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
let stopBlocks = emptyUnsubscribe;

/** Stops the social listeners. Safe to call twice, and when they were never started. */
export function stopSocial() {
  stopRequests();
  stopFriends();
  stopInvites();
  stopBlocks();
  stopRequests = emptyUnsubscribe;
  stopFriends = emptyUnsubscribe;
  stopInvites = emptyUnsubscribe;
  stopBlocks = emptyUnsubscribe;
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
  // Blocks are owner-readable only, and the query is pinned to the caller, so the rules accept it.
  stopBlocks = onSnapshot(query(collection(store, 'blocks'), where('blockerUid', '==', user.uid)), (snapshot) => {
    state.blocked = rowsOf(snapshot);
    render();
  }, (error) => reportSocialError('Block list listener', error));
  stopInvites = onSnapshot(query(collection(store, 'gameInvites'), where('toUid', '==', user.uid)), (snapshot) => {
    const pending = rowsOf(snapshot).filter((row) => row.status === 'pending');
    const nowMs = presenceNow();
    // An expired invite is only hidden here; deleting the room and the invite is the backend's
    // scheduled cleanup's job (a browser is not a reliable cleaner, and it is not privileged to be).
    for (const invite of pending.filter((row) => isRoomExpired(row, nowMs))) forgetKnownRoom(invite.roomId);
    state.invites = pending.filter((row) => !isRoomExpired(row, nowMs));
    render();
  }, (error) => reportSocialError('Game invite listener', error));
}

export function reportSocialError(source, error) {
  console.warn(`[PSD-gaming] ${source}:`, /** @type {any} */ (error)?.message);
  const message = `Friends and invites could not be loaded. ${friendlyError(error)}`;
  if (state.socialError === message) return;
  state.socialError = message;
  render();
}

/**
 * Exact username search through the backend.
 *
 * There is no profile query any more: the backend answers with one match or nothing, refuses
 * anonymous guests, spends a per-user lookup budget and hides players who blocked you. A client
 * cannot page the directory, and `firestore.rules` denies listing profiles outright.
 * @param {HTMLFormElement | { get: (name: string) => unknown }} form
 */
export function requestFriendSearch(form) {
  if (!state.user || state.user.isAnonymous || !state.profile) throw new Error('Create an account with a username before adding friends.');
  const username = String(form.get('username') || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,18}$/.test(username)) throw new Error('Enter a valid 3–18 character username.');
  state.friendSearchTerm = username;
  state.friendResults = [];
  render();
  void (async () => {
    try {
      const result = await callBackend('lookupUser', { username });
      const available = result.found && !result.alreadyFriends;
      state.friendResults = available ? [{ uid: result.uid, username: result.username }] : [];
      render();
      if (!available) {
        showToast(result.alreadyFriends ? `@${username} is already on your friends list.` : 'No available player found with that username.', 'warning');
      }
    } catch (error) {
      showToast(friendlyError(error), 'warning');
    }
  })();
}

/**
 * Send a friend request to the exact username shown in the search result.
 * @param {string} username
 */
export async function sendFriendRequest(username) {
  if (!state.user || state.user.isAnonymous || !state.profile) throw new Error('Sign in with a username to add friends.');
  await callBackend('sendFriendRequest', { username });
  state.friendResults = [];
  showToast(`Friend request sent to @${username}.`);
}

/**
 * Accept or decline a request. Accepting creates the friendship on the server, in the same
 * transaction that marks the request accepted, so the two can never disagree.
 * @param {string} requestId
 * @param {boolean} accepted
 */
export async function respondToFriend(requestId, accepted) {
  if (!state.user || !state.profile) throw new Error('Sign in to manage friend requests.');
  try {
    await callBackend('respondFriendRequest', { requestId, accept: Boolean(accepted) });
    showToast(accepted ? 'Friend request accepted.' : 'Friend request declined.');
  } catch (error) {
    throw unavailableSocialDocument(error, 'That friend request is no longer available.');
  }
}

/**
 * Accept a game invite and open its room. The backend validates the invite, its recipient and its
 * room; the room itself is then joined through the normal join path.
 * @param {string} inviteId
 * @param {string} roomId
 */
export async function joinGameInvite(inviteId, roomId) {
  try {
    await callBackend('respondGameInvite', { inviteId, accept: true });
    state.modal = null;
    setHash(`room/${roomId}`);
  } catch (error) {
    throw unavailableSocialDocument(error, 'This game invite is no longer valid.');
  }
}

/**
 * Send a problem report to the operator. What a report *does* is deliberately narrow: it is stored
 * for the admin studio and nothing else happens automatically (see the safety page).
 * @param {{ kind?: string, message: string, targetUid?: string, targetName?: string, roomId?: string }} report
 */
export async function reportProblem({ kind = 'other', message, targetUid = '', roomId = '' }) {
  if (!state.user) throw new Error('Sign in or continue as a guest before sending a report.');
  const trimmed = String(message || '').trim().slice(0, 1000);
  if (trimmed.length < 5) throw new Error('Describe the problem in a few words first.');
  const result = await callBackend('reportProblem', { kind, message: trimmed, targetUid, roomId });
  return result;
}

/**
 * Block someone. The backend clears anything already pending between the two players, hides them
 * from your search results and refuses their requests and invites.
 * @param {string} uid
 */
export async function blockPlayer(uid) {
  if (!state.user || state.user.uid === uid) throw new Error('Choose another player to block.');
  await callBackend('blockUser', { uid });
  showToast('Player blocked. They cannot send you requests or invites.');
}

/**
 * Unblock someone you blocked earlier.
 * @param {string} uid
 */
export async function unblockPlayer(uid) {
  if (!state.user) throw new Error('Sign in to manage blocked players.');
  if (!uid) throw new Error('Choose a player to unblock.');
  await callBackend('unblockUser', { uid });
  showToast('Player unblocked.');
}
