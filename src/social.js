/**
 * Social features: friend search, requests, blocking, reporting.
 */

import { state } from './state.js';
import { render } from './render.js';
import { showToast } from './ui/toast.js';
import { friendlyError } from './errors.js';
import * as api from './online/callables.js';

/**
 * Searches for users by username.
 */
export async function requestFriendSearch(form) {
  const term = String(new FormData(form).get('search') || '').trim();
  if (!term) return;
  state.friendSearchTerm = term;
  state.socialError = '';

  try {
    const result = await api.lookupUser({ username: term });
    state.friendResults = result?.users || [];
  } catch (error) {
    state.socialError = friendlyError(error);
    state.friendResults = [];
  }
  render();
}

/**
 * Sends a friend request.
 */
export async function sendFriendRequest(username) {
  await api.sendFriendRequest({ username });
  showToast(`Friend request sent to @${username}.`);
}

/**
 * Responds to a friend request (accept or decline).
 */
export async function respondToFriend(requestId, accept) {
  await api.respondFriendRequest({ requestId, accept });
  showToast(accept ? 'Friend request accepted!' : 'Friend request declined.');
}

/**
 * Joins a game invite.
 */
export async function joinGameInvite(inviteId, roomId) {
  await api.respondGameInvite({ inviteId, accept: true });
  if (roomId) {
    const { openRoomFromLink } = await import('./online/rooms.js');
    await openRoomFromLink(roomId);
  }
}

/**
 * Blocks a player.
 */
export async function blockPlayer(uid) {
  await api.blockUser({ uid });
  showToast('Player blocked.');
  render();
}

/**
 * Unblocks a player.
 */
export async function unblockPlayer(uid) {
  await api.unblockUser({ uid });
  showToast('Player unblocked.');
  render();
}

/**
 * Reports a problem.
 */
export async function reportProblem(data) {
  return api.reportProblem(data);
}