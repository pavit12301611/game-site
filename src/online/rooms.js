/**
 * Private rooms: create one, open one from an invite link, sit in the lobby, start the match, and
 * make a move.
 *
 * A room is one Firestore document whose id *is* the invite; Firestore rules make rooms
 * un-listable, so the link is the only way in. Two rules shape the code below:
 *
 * - A join is a transaction that re-reads the room, so two friends clicking the same link at the
 *   same moment cannot both take the last seat.
 * - A move is a transaction too (see `doOnlineAction`): the engine is applied to the state read
 *   inside the transaction, so concurrent turns can never silently overwrite each other.
 *
 * This module never imports the router: `createOnlineRoom` sets `location.hash` directly. That is
 * deliberate - the router imports this module, and a cycle would make the whole page fragile.
 */

import { collection, doc, onSnapshot, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { applyGameAction, createInitialGameState, getGame } from '../catalog.js';
import { friendlyError } from '../errors.js';
import { render } from '../render.js';
import { state } from '../state.js';
import { playerDisplayName } from '../ui/players.js';
import { ensureOnlineUser } from './session.js';
import { DISPLAY_NAME_STORAGE_KEY } from '../helpers.js';

/**
 * `db` is null only when Firebase never started (missing or invalid config). Everything in this
 * module runs after `ensureOnlineUser()`, which throws in exactly that case, so the cast matches
 * what the callers already guarantee.
 */
const store = /** @type {import('firebase/firestore').Firestore} */ (db);

/** A no-op unsubscribe, so `stopRoom` is always safe to call. */
const emptyUnsubscribe = () => {};

let stopRoom = emptyUnsubscribe;
/** Which room id a join is in flight for, so a double navigation cannot open it twice. */
let roomOpening = '';

export function subscribeToRoom(roomId) {
  stopRoom();
  state.roomId = roomId;
  state.roomError = '';
  stopRoom = onSnapshot(doc(store, 'rooms', roomId), (snapshot) => {
    if (!snapshot.exists()) {
      state.room = null;
      state.roomError = 'This invite room no longer exists.';
    } else {
      state.room = { id: snapshot.id, ...snapshot.data() };
      state.roomError = '';
      if (state.room.gameId && !getGame(state.room.gameId)) state.roomError = 'This room points to a game that is not in the catalog.';
    }
    render();
  }, (error) => {
    state.roomError = friendlyError(error);
    render();
  });
}

export async function openRoomFromLink(roomId) {
  if (roomOpening === roomId || state.roomId === roomId && state.room) return;
  roomOpening = roomId;
  try {
    const user = await ensureOnlineUser();
    const roomRef = doc(store, 'rooms', roomId);
    await runTransaction(store, async (transaction) => {
      const snapshot = await transaction.get(roomRef);
      if (!snapshot.exists()) throw new Error('This invite link is invalid or has expired.');
      const room = snapshot.data();
      const uids = room.playerUids || [];
      if (uids.includes(user.uid)) return;
      if (room.status !== 'waiting') throw new Error('This match has already started. Ask the host for a new room.');
      if (uids.length >= room.maxPlayers) throw new Error('This room is full. Ask the host for another invite.');
      if (room.status === 'finished') throw new Error('This match is over. Ask the host for a fresh invite link.');
      const name = playerDisplayName(user);
      const nextUids = [...uids, user.uid];
      const nextNames = { ...(room.playerNames || {}), [user.uid]: name };
      const nextPlayers = nextUids.map((uid, index) => ({ uid, name: nextNames[uid] || `Player ${index + 1}` }));
      transaction.update(roomRef, {
        playerUids: nextUids,
        playerNames: nextNames,
        state: createInitialGameState(room.gameId, nextPlayers, room.id),
        updatedAt: serverTimestamp(),
      });
    });
    subscribeToRoom(roomId);
  } catch (error) {
    state.roomError = friendlyError(error);
    render();
  } finally {
    roomOpening = '';
  }
}

/**
 * @param {string} gameId
 * @param {number} [maxPlayers]
 * @param {{ uid?: string, name?: string, friendshipId?: string } | null} [friend]
 * @param {string} [chosenName]
 */
export async function createOnlineRoom(gameId, maxPlayers = 2, friend = null, chosenName = '') {
  const game = getGame(gameId);
  if (!game) throw new Error('Choose one of the games in the catalog.');
  const user = await ensureOnlineUser();
  if (![2, 3].includes(Number(maxPlayers))) throw new Error('Choose a room size of 2 or 3 players.');
  const name = chosenName.trim().slice(0, 20) || playerDisplayName(user);
  state.displayName = name;
  localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, name);
  const roomRef = doc(collection(store, 'rooms'));
  const initialPlayers = [{ uid: user.uid, name }];
  const gameState = createInitialGameState(game, initialPlayers, roomRef.id);
  await setDoc(roomRef, {
    hostUid: user.uid,
    hostName: name,
    gameId,
    playerUids: [user.uid],
    playerNames: { [user.uid]: name },
    maxPlayers: Number(maxPlayers),
    status: 'waiting',
    state: gameState,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (friend?.uid) {
    const inviteRef = doc(collection(store, 'gameInvites'));
    await setDoc(inviteRef, {
      fromUid: user.uid,
      toUid: friend.uid,
      fromName: name,
      toName: friend.name,
      friendshipId: friend.friendshipId,
      roomId: roomRef.id,
      gameId,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  }
  state.local = null;
  state.page = 'room';
  state.roomError = '';
  if (location.hash !== `#/room/${roomRef.id}`) location.hash = `#/room/${roomRef.id}`;
  subscribeToRoom(roomRef.id);
}

/**
 * Give your seat back.
 *
 * Only while the room is still waiting: once a match has started the seats are part of the match,
 * and leaving means walking away from the game, not un-joining it. If you were the last person in
 * the room, the empty room is deleted instead of being left behind as litter.
 */
export async function leaveWaitingRoom() {
  const room = state.room;
  const user = state.user;
  if (!room || !user || room.status !== 'waiting') return;
  const roomRef = doc(store, 'rooms', room.id);
  await runTransaction(store, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) return;
    const current = snapshot.data();
    if (current.status !== 'waiting') return;
    const uids = (current.playerUids || []).filter((uid) => uid !== user.uid);
    if (uids.length === (current.playerUids || []).length) return; // you were not in it
    if (!uids.length) {
      transaction.delete(roomRef);
      return;
    }
    const playerNames = { ...(current.playerNames || {}) };
    delete playerNames[user.uid];
    const players = uids.map((uid) => ({ uid, name: playerNames[uid] || 'Player' }));
    transaction.update(roomRef, {
      playerUids: uids,
      playerNames,
      state: createInitialGameState(current.gameId, players, room.id),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function startRoom() {
  if (!state.room || !state.user) return;
  if (state.room.hostUid !== state.user.uid) throw new Error('Only the host can start this room.');
  if ((state.room.playerUids || []).length < 2) throw new Error('Invite at least one friend before starting.');
  await updateDoc(doc(store, 'rooms', state.room.id), { status: 'playing', updatedAt: serverTimestamp() });
}

/**
 * What a move writes back to the room.
 *
 * Usually it is only the new game state. When that state says the match is over the room closes
 * too, so the lobby, the admin list and anyone opening the link later see a finished match instead
 * of one that looks abandoned mid-play. (firestore.rules allows `playing -> finished` only when the
 * state written in the same update is finished, which is exactly this.)
 *
 * @param {Record<string, any>} nextState the state the engine produced
 * @returns {Record<string, any>} the fields to update
 */
export function roomUpdateForMove(nextState) {
  if (nextState?.phase !== 'finished') return { state: nextState, updatedAt: serverTimestamp() };
  return { state: nextState, status: 'finished', winnerUid: nextState.winnerUid ?? null, updatedAt: serverTimestamp() };
}

export async function doOnlineAction(action) {
  if (!state.room || !state.user) throw new Error('Join a room before making a move.');
  const roomRef = doc(store, 'rooms', state.room.id);
  const user = state.user;
  await runTransaction(store, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) throw new Error('The room was closed.');
    const room = snapshot.data();
    const players = (room.playerUids || []).map((uid, index) => ({ uid, name: room.playerNames?.[uid] || `Player ${index + 1}` }));
    if (!players.some((player) => player.uid === user.uid)) throw new Error('You are no longer in this room.');
    const game = getGame(room.gameId);
    if (!game) throw new Error('This room points to a game that is not in the catalog.');
    const nextState = applyGameAction(game, room.state, user.uid, action, players);
    transaction.update(roomRef, roomUpdateForMove(nextState));
  });
}

export function stopActiveRoom() {
  stopRoom();
  stopRoom = emptyUnsubscribe;
  state.room = null;
  state.roomId = null;
  state.roomError = '';
  roomOpening = '';
}
