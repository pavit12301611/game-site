/**
 * Online room management: create, join, leave, start, move, rematch, presence.
 */

import { auth, db, firebaseReady } from '../firebase.js';
import { state } from '../state.js';
import { render } from '../render.js';
import { showToast } from '../ui/toast.js';
import { navigate } from '../router.js';
import { friendlyError } from '../errors.js';
import * as api from './callables.js';
import { ensureOnlineUser } from './session.js';
import { startPresence, stopPresence } from './presence.js';
import { isRoomExpired } from '../helpers.js';
import { doc, onSnapshot } from 'firebase/firestore';

let roomUnsubscribe = null;

/**
 * Opens a room from an invite link.
 */
export async function openRoomFromLink(roomId) {
  if (!firebaseReady) throw new Error('Firebase is not configured.');
  await ensureOnlineUser();

  state.roomId = roomId;
  state.roomError = '';
  state.room = null;

  // Join the room
  try {
    await api.joinRoom({ roomId });
  } catch (error) {
    state.roomError = friendlyError(error);
    render();
    return;
  }

  // Subscribe to the room document
  subscribeToRoom(roomId);
}

function subscribeToRoom(roomId) {
  stopActiveRoom();
  roomUnsubscribe = onSnapshot(
    doc(db, 'rooms', roomId),
    (snapshot) => {
      if (!snapshot.exists()) {
        state.room = null;
        state.roomError = 'This room no longer exists.';
        render();
        return;
      }
      const data = snapshot.data();
      state.room = { id: snapshot.id, ...data };

      // Check expiry
      if (isRoomExpired(state.room)) {
        state.roomError = 'This room has expired.';
        render();
        return;
      }

      state.roomError = '';
      render();
      startPresence(roomId);
    },
    (error) => {
      state.roomError = friendlyError(error);
      render();
    },
  );
}

/**
 * Stops listening to the active room.
 */
export function stopActiveRoom() {
  if (roomUnsubscribe) {
    roomUnsubscribe();
    roomUnsubscribe = null;
  }
  stopPresence();
}

/**
 * Creates an online room.
 */
export async function createOnlineRoom(gameId, maxPlayers, friend, displayName) {
  await ensureOnlineUser();
  const result = await api.createRoom({
    gameId,
    maxPlayers,
    friendUid: friend?.uid || '',
    displayName: displayName || state.displayName || 'Player',
  });
  const roomId = result.roomId;
  state.roomId = roomId;
  navigate('room');
  openRoomFromLink(roomId);
  return result;
}

/**
 * Joins a room by its 7-character code.
 */
export async function joinRoomByCode(code) {
  await ensureOnlineUser();
  const result = await api.joinRoom({ code: code.trim() });
  const roomId = result.roomId;
  state.roomId = roomId;
  navigate('room');
  subscribeToRoom(roomId);
}

/**
 * Leaves a waiting room.
 */
export async function leaveWaitingRoom() {
  if (!state.roomId || !firebaseReady) return;
  try {
    await api.leaveRoom({ roomId: state.roomId });
  } catch (error) {
    // If the room is already gone, that is fine
    if (error?.code !== 'not-found') throw error;
  }
  stopActiveRoom();
  state.room = null;
  state.roomId = null;
}

/**
 * Starts the room (host only).
 */
export async function startRoom() {
  if (!state.roomId) throw new Error('No room to start.');
  await api.startRoom({ roomId: state.roomId });
}

/**
 * Claims host of an abandoned room.
 */
export async function claimHost() {
  if (!state.roomId) return false;
  const result = await api.claimHost({ roomId: state.roomId });
  return result?.changed || false;
}

/**
 * Sends a rematch request.
 */
export async function rematchRoom() {
  if (!state.roomId) throw new Error('No room.');
  const result = await api.rematch({ roomId: state.roomId });
  return result;
}