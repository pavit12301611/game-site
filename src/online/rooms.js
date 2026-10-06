/**
 * Private rooms: create one, open one from an invite link, sit in the lobby, start the match, and
 * make a move.
 *
 * The trusted backend owns the room. This module is the browser half:
 *
 * - **Reads** are live Firestore snapshots of the room document (members only, `firestore.rules`) plus
 *   the player's own private view document for games with hidden information.
 * - **Writes** are callable Cloud Functions (`./callables.js`): create, join, leave, start, claim the
 *   host seat, move, rematch, invite. The rules deny the browser any write to a room, its secrets or
 *   its views, so nothing below has to be trusted - and nothing below pretends to be authoritative.
 * - **The local queue** still exists so a fast game feels immediate: a move is drawn optimistically
 *   when the engine's public state is the whole story (line, drop, race, maze, rally), and hidden
 *   games simply send and show the server's answer. `clientActionId` makes a retry safe, so a
 *   dropped response can never apply a move twice.
 *
 * Expiry is the backend's job too (a scheduled function purges expired rooms, their secrets, views
 * and heartbeats every 15 minutes). This module only stops showing a room once it is over its hour,
 * and forgets it locally.
 */

import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { getGame } from '../catalog.js';
import { friendlyError } from '../errors.js';
import { mergeView } from '../../shared/online/view.js';
import { render } from '../render.js';
import { presenceNow, state } from '../state.js';
import { playerDisplayName } from '../ui/players.js';
import { ensureOnlineUser } from './session.js';
import { callBackend } from './callables.js';
import { startPresence, stopPresence } from './presence.js';
import { roomAfterOnlineActions } from './action-sync.js';
import { resetChat, subscribeToChat } from './chat.js';
import { ROOM_CODE_LENGTH } from '../../shared/online/policy.js';
import {
  DISPLAY_NAME_STORAGE_KEY,
  EXPIRED_ROOM_MESSAGE,
  KNOWN_ROOMS_STORAGE_KEY,
  ROOM_TTL_MS,
  isRoomExpired,
  loadKnownRooms,
  partitionKnownRooms,
  roomCreatedAtMs,
  roomRemainingMs,
  saveKnownRooms,
  timestampToMillis,
} from '../helpers.js';

export {
  EXPIRED_ROOM_MESSAGE,
  KNOWN_ROOMS_STORAGE_KEY,
  ROOM_TTL_MS,
  isRoomExpired,
  loadKnownRooms,
  partitionKnownRooms,
  roomCreatedAtMs,
  roomRemainingMs,
  saveKnownRooms,
  timestampToMillis,
};

/**
 * `db` is null only when Firebase never started (missing or invalid config). Everything in this
 * module runs after `ensureOnlineUser()`, which throws in exactly that case, so the cast matches
 * what the callers already guarantee.
 */
const store = /** @type {import('firebase/firestore').Firestore} */ (db);

/** A no-op unsubscribe, so `stopRoom` is always safe to call. */
const emptyUnsubscribe = () => {};

let stopRoom = emptyUnsubscribe;
let stopPrivateView = emptyUnsubscribe;
/** Which room id a join is in flight for, so a double navigation cannot open it twice. */
let roomOpening = '';
let actionSequence = 0;
/** @type {ReturnType<typeof setTimeout> | null} */
let roomExpiryTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let knownRoomsSweepTimer = null;

function clearActiveRoomExpiryTimer() {
  if (roomExpiryTimer !== null) {
    clearTimeout(roomExpiryTimer);
    roomExpiryTimer = null;
  }
}

function clearKnownRoomsSweepTimer() {
  if (knownRoomsSweepTimer !== null) {
    clearTimeout(knownRoomsSweepTimer);
    knownRoomsSweepTimer = null;
  }
}

/**
 * Record a room ID this browser created or joined so this browser can stop showing it after its
 * hour, even if the player reloads. (Deleting the documents is the backend's job; this list is only
 * about what this tab keeps in memory and localStorage.)
 * @param {string} roomId
 * @param {number | null} [createdAtMs]
 * @param {Pick<Storage, 'getItem' | 'setItem'> | null} [storage]
 */
export function rememberKnownRoom(roomId, createdAtMs = presenceNow(), storage = globalThis.localStorage) {
  const cleanId = String(roomId || '').trim();
  if (!cleanId) return;
  const resolvedMs = timestampToMillis(createdAtMs) ?? presenceNow();
  const existing = loadKnownRooms(storage);
  const previous = existing.find((entry) => entry.id === cleanId);
  const entryMs = previous ? Math.min(previous.createdAtMs, resolvedMs) : resolvedMs;
  const next = [{ id: cleanId, createdAtMs: entryMs }, ...existing.filter((entry) => entry.id !== cleanId)];
  saveKnownRooms(next, storage);
  if (storage === globalThis.localStorage) scheduleKnownRoomsSweep();
}

/**
 * Remove a room ID from the known-rooms list.
 * @param {string} roomId
 * @param {Pick<Storage, 'getItem' | 'setItem'> | null} [storage]
 */
export function forgetKnownRoom(roomId, storage = globalThis.localStorage) {
  const cleanId = String(roomId || '').trim();
  if (!cleanId) return;
  const existing = loadKnownRooms(storage);
  if (!existing.some((entry) => entry.id === cleanId)) return;
  saveKnownRooms(existing.filter((entry) => entry.id !== cleanId), storage);
}

/**
 * Stop tracking an expired room. Deletion is the backend's job (the scheduled `cleanupExpired`
 * function deletes the room, its secret state, its private views and its heartbeats every 15
 * minutes); a browser must not be the only thing that cleans up, which is exactly what this module
 * used to rely on.
 * @param {string} roomId
 * @param {Pick<Storage, 'getItem' | 'setItem'> | null} [storage]
 */
export async function deleteExpiredRoom(roomId, storage = globalThis.localStorage) {
  const cleanId = String(roomId || '').trim();
  if (!cleanId) return { roomId: '', forgotten: false };
  forgetKnownRoom(cleanId, storage);
  return { roomId: cleanId, forgotten: true, deletedByBackend: true };
}

/**
 * Close the currently open room because its 1-hour lifetime has elapsed. The room itself is deleted
 * by the backend's scheduled cleanup; here we stop showing it and stop the heartbeat.
 * @param {string} roomId
 * @param {Pick<Storage, 'getItem' | 'setItem'> | null} [storage]
 */
export async function expireActiveRoom(roomId, storage = globalThis.localStorage) {
  clearActiveRoomExpiryTimer();
  if (state.roomId === roomId) {
    stopPresence({ markLeft: false });
    stopRoom();
    stopRoom = emptyUnsubscribe;
    stopPrivateView();
    stopPrivateView = emptyUnsubscribe;
    if (activeActions?.roomId === roomId) activeActions = null;
    resetChat();
    state.room = null;
    state.onlineActionsPending = 0;
    state.roomError = EXPIRED_ROOM_MESSAGE;
    render();
  }
  await deleteExpiredRoom(roomId, storage);
}

/**
 * Schedule forgetting the currently open room at `createdAt + 1 hour`. The document is deleted by
 * the backend; this timer only decides when this tab stops treating it as live.
 * @param {Record<string, any>} room
 */
function scheduleActiveRoomExpiry(room) {
  clearActiveRoomExpiryTimer();
  const remainingMs = roomRemainingMs(room, presenceNow());
  if (remainingMs === null) return;
  roomExpiryTimer = setTimeout(() => {
    roomExpiryTimer = null;
    if (state.roomId === room.id) void expireActiveRoom(room.id);
  }, remainingMs);
}

function scheduleKnownRoomsSweep(nowMs = presenceNow()) {
  clearKnownRoomsSweepTimer();
  if (!state.user) return;
  const { expired, nextDelayMs } = partitionKnownRooms(loadKnownRooms(), nowMs);
  if (expired.length) {
    knownRoomsSweepTimer = setTimeout(() => {
      knownRoomsSweepTimer = null;
      void sweepExpiredKnownRooms();
    }, 0);
    return;
  }
  if (nextDelayMs !== null) {
    knownRoomsSweepTimer = setTimeout(() => {
      knownRoomsSweepTimer = null;
      void sweepExpiredKnownRooms();
    }, nextDelayMs + 50);
  }
}

/**
 * Forget every tracked room whose age has reached 1 hour, and schedule the next check if any
 * younger rooms are still tracked. No Firestore writes: the backend's cleanup owns deletion.
 * @param {number} [nowMs]
 * @param {{ storage?: Pick<Storage, 'getItem' | 'setItem'> | null }} [deps]
 * @returns {Promise<string[]>} the room ids that were forgotten
 */
export async function sweepExpiredKnownRooms(nowMs = presenceNow(), deps = {}) {
  clearKnownRoomsSweepTimer();
  const storage = deps.storage === undefined ? globalThis.localStorage : deps.storage;
  const entries = loadKnownRooms(storage);
  if (!entries.length) return [];
  const { expired, active, nextDelayMs } = partitionKnownRooms(entries, nowMs);
  if (expired.length) {
    saveKnownRooms(active, storage);
    for (const entry of expired) {
      if (state.roomId === entry.id) await expireActiveRoom(entry.id, storage);
      else await deleteExpiredRoom(entry.id, storage);
    }
  }
  if (storage === globalThis.localStorage && nextDelayMs !== null) {
    knownRoomsSweepTimer = setTimeout(() => {
      knownRoomsSweepTimer = null;
      void sweepExpiredKnownRooms();
    }, nextDelayMs + 50);
  }
  return expired.map((entry) => entry.id);
}

/**
 * One queue per room visit. Only one backend call from this browser runs at a time; actions pressed
 * while it is in flight become the next batch. That keeps fast games from starting one callable per
 * tap.
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
 *   publicRoom: Record<string, any> | null,
 *   privateState: Record<string, any> | null,
 *   pending: PendingAction[],
 *   processing: boolean,
 * }} ActionContext
 */

/** @type {ActionContext | null} */
let activeActions = null;

/** A short, unique id used to make a retried move idempotent on the server. */
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
 * The room as this player should see it: the public document plus their own private fields (Sea
 * Battle's `myShips`). Hidden state stays hidden; the merge only ever adds the caller's own view.
 * @param {ActionContext} context
 */
function mergedRoom(context) {
  const room = context.publicRoom;
  if (!room) return null;
  return { ...room, state: mergeView(room.state, context.privateState) };
}

/**
 * Draw the last server room plus every input that is still on its way. A hidden-information move
 * cannot be drawn locally (the client does not have the opponent's state), so it simply waits for
 * the server's answer.
 * @param {ActionContext} context
 * @param {boolean} [paint]
 */
function projectPendingActions(context, paint = true) {
  if (!isActiveContext(context)) return;
  /** @type {Record<string, any> | null} */
  let projected = mergedRoom(context);
  for (const entry of context.pending) {
    if (!projected) break;
    try {
      projected = roomAfterOnlineActions(projected, context.uid, [entry]).room;
    } catch {
      // Either the move needs state this client does not have (hidden games) or a remote move made
      // the optimistic frame invalid. The server decides; a stale frame must not win.
    }
  }
  state.room = projected;
  state.onlineActionsPending = context.pending.length;
  if (paint) render();
}

/**
 * Send queued moves to the backend, one at a time, in order.
 *
 * The backend is the authority: it re-checks membership, room status, lifetime, turn order, the
 * action shape and tap tempo against the stored state, and answers with the new public state (and
 * this player's private view). A failed move is removed from the queue and its promise rejects with
 * a sentence the caller can show.
 * @param {ActionContext} context
 */
async function flushOnlineActions(context) {
  if (context.processing) return;
  context.processing = true;
  try {
    for (;;) {
      const entry = context.pending.find((item) => item.status === 'queued');
      if (!entry) break;
      entry.status = 'sending';
      try {
        const payload = await callBackend('playMove', {
          roomId: context.roomId,
          action: entry.action,
          clientActionId: entry.id,
        });
        if (payload?.publicState) {
          context.publicRoom = {
            ...(context.publicRoom || {}),
            id: payload.roomId,
            status: payload.status,
            gameId: payload.gameId,
            playerUids: payload.playerUids,
            hostUid: payload.hostUid,
            state: payload.publicState,
          };
          context.privateState = payload.privateState ?? null;
        }
        context.pending = context.pending.filter((item) => item !== entry);
        projectPendingActions(context);
        entry.resolve();
      } catch (error) {
        context.pending = context.pending.filter((item) => item !== entry);
        projectPendingActions(context);
        entry.reject(error);
      }
    }
  } finally {
    context.processing = false;
  }
}

/**
 * Listen to a room you are a member of, and start saying "I am here" in it.
 *
 * Two snapshots: the room (public state, rules allow members only) and, for games with hidden
 * information, this player's own `views/{uid}` document.
 * @param {string} roomId
 * @param {string} uid
 */
export function subscribeToRoom(roomId, uid) {
  clearActiveRoomExpiryTimer();
  stopRoom();
  stopPrivateView();
  resetChat();
  state.roomId = roomId;
  state.roomError = '';
  if (!activeActions || activeActions.roomId !== roomId || activeActions.uid !== uid) {
    activeActions = { roomId, uid, publicRoom: null, privateState: null, pending: [], processing: false };
    state.onlineActionsPending = 0;
  }
  const context = activeActions;
  startPresence(roomId, uid);
  // Subscribe once to the chat subcollection; the snapshot will be empty in the lobby (chat rules
  // allow the read regardless of status - the panel is only drawn while playing, and the backend
  // refuses sends after the game ends). The backend deletes every message when status becomes
  // `finished` or a rematch starts, so the live query clears itself.
  subscribeToChat(roomId);
  stopRoom = onSnapshot(doc(store, 'rooms', roomId), (snapshot) => {
    if (!isActiveContext(context)) return;
    if (!snapshot.exists()) {
      clearActiveRoomExpiryTimer();
      forgetKnownRoom(roomId);
      context.publicRoom = null;
      state.room = null;
      state.onlineActionsPending = 0;
      resetChat();
      state.roomError = 'This invite room no longer exists.';
    } else {
      const data = snapshot.data({ serverTimestamps: 'estimate' }) ?? snapshot.data();
      const room = { id: snapshot.id, ...data };
      const nowMs = presenceNow();
      if (isRoomExpired(room, nowMs)) {
        void expireActiveRoom(roomId);
        return;
      }
      rememberKnownRoom(roomId, roomCreatedAtMs(room) ?? nowMs);
      scheduleActiveRoomExpiry(room);
      context.publicRoom = room;
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
  stopPrivateView = onSnapshot(doc(store, 'rooms', roomId, 'views', uid), (snapshot) => {
    if (!isActiveContext(context)) return;
    context.privateState = snapshot.exists() ? snapshot.data() : null;
    projectPendingActions(context);
  }, () => {
    // A missing or unreadable private view is not fatal: the game simply draws without it.
    context.privateState = null;
  });
}

/**
 * Join a room from an invite link (or a typed code) through the backend, then listen to it.
 *
 * Joining is one validated call: the backend re-reads the room, checks its status, lifetime and
 * seats, gives the seat a name, rebuilds the state for the new player list and writes it with the
 * secret half. A running match only accepts a player who was already in it (a resume).
 * @param {string} roomId
 * @param {string} [code] the 7-character code the host read out, when there is no full link
 */
export async function openRoomFromLink(roomId, code = '') {
  if (roomOpening === roomId || (state.roomId === roomId && state.room)) return;
  roomOpening = roomId;
  try {
    const user = await ensureOnlineUser();
    const payload = await callBackend('joinRoom', {
      ...(roomId ? { roomId } : {}),
      ...(code ? { code } : {}),
      displayName: playerDisplayName(user),
    });
    if (payload?.roomId) rememberKnownRoom(payload.roomId, timestampToMillis(payload.createdAt) ?? presenceNow());
    subscribeToRoom(payload.roomId, user.uid);
  } catch (error) {
    const id = String(roomId || code || '').trim();
    if (id && ['room-not-found', 'room-expired', 'room-finished', 'room-started', 'room-full', 'code-ambiguous'].includes(/** @type {any} */ (error)?.code)) {
      forgetKnownRoom(id);
    }
    state.roomError = friendlyError(error);
    render();
  } finally {
    roomOpening = '';
  }
}

/**
 * Join with the 7-character room code instead of a link.
 *
 * `rooms.code` is only stored on the room document (members-only) and the lookup runs on the
 * backend, so a code opens exactly the room it was printed for and the browser never queries the
 * rooms collection. Codes and links are equivalent secrets: whoever has one gets in.
 * @param {string} rawCode
 */
export async function joinRoomByCode(rawCode) {
  const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== ROOM_CODE_LENGTH) throw new Error(`Room codes are exactly ${ROOM_CODE_LENGTH} characters — copy the one next to the invite link.`);
  const user = await ensureOnlineUser();
  const payload = await callBackend('joinRoom', { code, displayName: playerDisplayName(user) });
  if (!payload?.roomId) throw new Error('That room code did not lead to a room. Ask the host for a fresh link.');
  rememberKnownRoom(payload.roomId, timestampToMillis(payload.createdAt) ?? presenceNow());
  state.local = null;
  state.page = 'room';
  state.roomError = '';
  if (location.hash !== `#/room/${payload.roomId}`) location.hash = `#/room/${payload.roomId}`;
  subscribeToRoom(payload.roomId, user.uid);
  return payload.roomId;
}

/**
 * Create a room through the backend, optionally inviting a friend in the same gesture.
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
  const payload = await callBackend('createRoom', { gameId, maxPlayers: Number(maxPlayers), displayName: name });
  rememberKnownRoom(payload.roomId, presenceNow());
  if (friend?.uid) {
    // A friend invite is a separate, validated call; a failure must not lose the room.
    await callBackend('createGameInvite', { roomId: payload.roomId, toUid: friend.uid }).catch((error) => {
      console.warn('[PSD-gaming] Game invite was not sent:', /** @type {any} */ (error)?.message);
    });
  }
  state.local = null;
  state.page = 'room';
  state.roomError = '';
  if (location.hash !== `#/room/${payload.roomId}`) location.hash = `#/room/${payload.roomId}`;
  subscribeToRoom(payload.roomId, user.uid);
}

/**
 * Give your seat back in a waiting lobby.
 *
 * Only while the room is still waiting: once a match has started the seats are part of the match,
 * and leaving means walking away from the game, not un-joining it. If you were the last person in
 * the room, the backend deletes it instead of leaving it behind as litter.
 */
export async function leaveWaitingRoom() {
  const room = state.room;
  const user = state.user;
  if (!room || !user || room.status !== 'waiting') return;
  stopPresence({ markLeft: false });
  const result = await callBackend('leaveRoom', { roomId: room.id });
  if (result?.deleted) forgetKnownRoom(room.id);
}

/** Start the match. The backend checks that you are the host and that at least two seats are taken. */
export async function startRoom() {
  if (!state.room || !state.user) return;
  await callBackend('startRoom', { roomId: state.room.id });
}

/**
 * Take over the lobby when the host has gone.
 *
 * The backend decides whether the host really is away (it reads the heartbeat); the button only
 * asks. Returns whether the host seat actually moved.
 * @returns {Promise<boolean>}
 */
export async function claimHost() {
  if (!state.room || !state.user) return false;
  const result = await callBackend('claimHost', { roomId: state.room.id });
  return Boolean(result?.changed);
}

/** Reset a finished match for everyone. Host only, enforced by the backend. */
export async function rematchRoom() {
  if (!state.room || !state.user) return;
  await callBackend('rematch', { roomId: state.room.id });
}

/**
 * Draw an online input now when that is safe, then send it to the backend.
 *
 * This intentionally is not an `async function`: validation and the optimistic frame happen before
 * a Promise is returned, so callers can play feedback at press time rather than after network RTT.
 * Games whose public state is the whole story (line, drop, race, maze, rally) get an instant frame;
 * hidden-information games cannot be projected locally and simply show a pending hint until the
 * server answers.
 * @param {Record<string, any>} action
 * @returns {Promise<void>}
 */
export function doOnlineAction(action) {
  if (!state.room || !state.user) throw new Error('Join a room before making a move.');
  if (isRoomExpired(state.room, presenceNow())) {
    void expireActiveRoom(state.room.id);
    throw new Error(EXPIRED_ROOM_MESSAGE);
  }
  const context = activeActions;
  if (!context || context.roomId !== state.room.id || context.uid !== state.user.uid) {
    throw new Error('The room is still connecting. Try that move again.');
  }

  const entryBase = { id: nextActionId(context.uid), action };
  /** @type {Record<string, any> | null} */
  let preview = null;
  try {
    preview = roomAfterOnlineActions(mergedRoom(context) ?? state.room, context.uid, [entryBase]).room;
  } catch {
    preview = null; // hidden state: the server's answer is the first frame the player sees
  }

  return new Promise((resolve, reject) => {
    /** @type {PendingAction} */
    const entry = { ...entryBase, status: 'queued', resolve, reject };
    context.pending.push(entry);
    if (preview) state.room = preview;
    state.onlineActionsPending = context.pending.length;
    render();
    void flushOnlineActions(context);
  });
}

export function stopActiveRoom() {
  clearActiveRoomExpiryTimer();
  stopPresence({ markLeft: true });
  stopRoom();
  stopPrivateView();
  stopRoom = emptyUnsubscribe;
  stopPrivateView = emptyUnsubscribe;
  activeActions = null;
  resetChat();
  state.room = null;
  state.roomId = null;
  state.roomError = '';
  state.onlineActionsPending = 0;
  roomOpening = '';
}
