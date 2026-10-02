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
import { createInitialGameState, getGame } from '../catalog.js';
import { friendlyError } from '../errors.js';
import { render } from '../render.js';
import { state } from '../state.js';
import { playerDisplayName } from '../ui/players.js';
import { ensureOnlineUser } from './session.js';
import { deletePresenceIn, startPresence, stopPresence } from './presence.js';
import { roomAfterOnlineActions } from './action-sync.js';
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
let actionSequence = 0;

/**
 * One queue per room visit. Only one transaction from this browser runs at a time; actions pressed
 * while it is in flight become the next batch. That removes self-contention in fast games (a tap
 * race used to start one competing transaction per tap).
 * @typedef {{
 *   id: string,
 *   action: Record<string, any>,
 *   status: 'queued' | 'sending',
 *   resolve: () => void,
 *   reject: (error: unknown) => void,
 * }} PendingAction
 * @typedef {{
 *   roomId: string,
 *   uid: string,
 *   authoritativeRoom: Record<string, any> | null,
 *   pending: PendingAction[],
 *   processing: boolean,
 * }} ActionContext
 */

/** @type {ActionContext | null} */
let activeActions = null;

/** A short, unique id used to make replay around a snapshot/commit boundary idempotent. */
function nextActionId(uid) {
  actionSequence += 1;
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId || `${uid.slice(0, 8)}-${Date.now().toString(36)}-${actionSequence.toString(36)}`;
}

/** @param {ActionContext} context */
function isActiveContext(context) {
  return activeActions === context && state.roomId === context.roomId;
}

/**
 * Draw the last server room plus every input that is still on its way. If a remote move made one
 * of those inputs invalid, leave it out; its transaction will reject it with the useful error.
 * @param {ActionContext} context
 * @param {boolean} [paint]
 */
function projectPendingActions(context, paint = true) {
  if (!isActiveContext(context) || !context.authoritativeRoom) return;
  let projected = context.authoritativeRoom;
  for (const entry of context.pending) {
    try {
      projected = roomAfterOnlineActions(projected, context.uid, [entry]).room;
    } catch {
      // The authoritative transaction decides the error. A stale optimistic frame must not win.
    }
  }
  state.room = projected;
  state.onlineActionsPending = context.pending.length;
  if (paint) render();
}

/** @param {ActionContext} context */
async function flushOnlineActions(context) {
  if (context.processing) return;
  const batch = context.pending.filter((entry) => entry.status === 'queued');
  if (!batch.length) return;
  context.processing = true;
  for (const entry of batch) entry.status = 'sending';

  const roomRef = doc(store, 'rooms', context.roomId);
  let newestRoom = context.authoritativeRoom;
  try {
    const committedRoom = await runTransaction(store, async (transaction) => {
      const snapshot = await transaction.get(roomRef);
      if (!snapshot.exists()) throw new Error('The room was closed.');
      const room = { id: snapshot.id, ...snapshot.data() };
      newestRoom = room;
      const result = roomAfterOnlineActions(room, context.uid, batch);
      if (result.appliedIds.length) transaction.update(roomRef, roomUpdateForMove(result.room.state));
      return result.room;
    });
    context.authoritativeRoom = committedRoom;
    const sent = new Set(batch);
    context.pending = context.pending.filter((entry) => !sent.has(entry));
    projectPendingActions(context);
    for (const entry of batch) entry.resolve();
  } catch (error) {
    // Roll back only the rejected optimistic inputs. When the transaction managed to read a newer
    // server room before rejecting, use it immediately instead of waiting for another snapshot.
    if (newestRoom) context.authoritativeRoom = newestRoom;
    const failed = new Set(batch);
    context.pending = context.pending.filter((entry) => !failed.has(entry));
    projectPendingActions(context);
    for (const entry of batch) entry.reject(error);
  } finally {
    context.processing = false;
    if (context.pending.some((entry) => entry.status === 'queued')) void flushOnlineActions(context);
  }
}

/**
 * Listen to a room you are a member of, and start saying "I am here" in it.
 * @param {string} roomId
 * @param {string} uid  the member listening; only members may write presence (firestore.rules)
 */
export function subscribeToRoom(roomId, uid) {
  stopRoom();
  state.roomId = roomId;
  state.roomError = '';
  if (!activeActions || activeActions.roomId !== roomId || activeActions.uid !== uid) {
    activeActions = { roomId, uid, authoritativeRoom: null, pending: [], processing: false };
    state.onlineActionsPending = 0;
  }
  const context = activeActions;
  startPresence(roomId, uid);
  stopRoom = onSnapshot(doc(store, 'rooms', roomId), (snapshot) => {
    if (!isActiveContext(context)) return;
    if (!snapshot.exists()) {
      context.authoritativeRoom = null;
      state.room = null;
      state.onlineActionsPending = 0;
      state.roomError = 'This invite room no longer exists.';
    } else {
      context.authoritativeRoom = { id: snapshot.id, ...snapshot.data() };
      state.roomError = '';
      projectPendingActions(context, false);
      if (state.room?.gameId && !getGame(state.room.gameId)) state.roomError = 'This room points to a game that is not in the catalog.';
    }
    render();
  }, (error) => {
    if (!isActiveContext(context)) return;
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
    subscribeToRoom(roomId, user.uid);
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
  subscribeToRoom(roomRef.id, user.uid);
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
  // Stop the heartbeat first (without a "left" write: the seat itself goes away below), and take
  // the heartbeat document with you in the same transaction, so a deleted room leaves no litter.
  stopPresence({ markLeft: false });
  await runTransaction(store, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) return;
    const current = snapshot.data();
    if (current.status !== 'waiting') return;
    const uids = (current.playerUids || []).filter((uid) => uid !== user.uid);
    if (uids.length === (current.playerUids || []).length) return; // you were not in it
    deletePresenceIn(transaction, room.id, user.uid);
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

/**
 * Draw an online input now, then reconcile it through the room transaction in the background.
 *
 * This intentionally is not an `async function`: validation and the optimistic frame happen before
 * a Promise is returned, so callers can play feedback at press time rather than after network RTT.
 * @param {Record<string, any>} action
 * @returns {Promise<void>}
 */
export function doOnlineAction(action) {
  if (!state.room || !state.user) throw new Error('Join a room before making a move.');
  const context = activeActions;
  if (!context || context.roomId !== state.room.id || context.uid !== state.user.uid) {
    throw new Error('The room is still connecting. Try that move again.');
  }

  const entryBase = {
    id: nextActionId(context.uid),
    action,
  };
  // Validate against everything already visible and produce the instant frame before enqueuing.
  const preview = roomAfterOnlineActions(state.room, context.uid, [entryBase]).room;

  return new Promise((resolve, reject) => {
    /** @type {PendingAction} */
    const entry = { ...entryBase, status: 'queued', resolve, reject };
    context.pending.push(entry);
    state.room = preview;
    state.onlineActionsPending = context.pending.length;
    render();
    void flushOnlineActions(context);
  });
}

export function stopActiveRoom() {
  stopPresence({ markLeft: true });
  stopRoom();
  stopRoom = emptyUnsubscribe;
  activeActions = null;
  state.room = null;
  state.roomId = null;
  state.roomError = '';
  state.onlineActionsPending = 0;
  roomOpening = '';
}
