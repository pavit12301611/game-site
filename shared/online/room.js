/**
 * Room transitions as pure functions.
 *
 * The trusted backend (Cloud Functions) is the only writer of room documents, and this module is the
 * whole of its game logic: it is called with the current room plus the server-only state, the uid
 * that asked, the action, the server clock, and the engine functions to use. It returns the next
 * room fields and the next secret state, or throws a `RoomError` with a code the client can turn
 * into a sentence.
 *
 * Two properties matter:
 *
 *   - **No clock, no randomness, no Firebase.** The caller passes `nowMs` and the seed, so every
 *     branch here is unit-testable and cannot depend on the machine it runs on.
 *   - **The engine is injected.** `engines` is the same registry the browser uses
 *     (src/engines/index.js), so client practice and server validation cannot drift apart.
 *
 * Nothing here trusts the client beyond "this uid asked for this action": membership, turn order,
 * room status, room lifetime, action shape and tap tempo are all re-checked against the stored room.
 */

import {
  ACTION_KEYS,
  ENGINE_POLICY,
  EXPIRED_ROOM_MESSAGE,
  MAX_ROOM_PLAYERS,
  RACE_BURST_TAPS,
  RACE_MAX_TAPS_PER_CALL,
  ROOM_TTL_MS,
  takeTapTokens,
} from './policy.js';
import { projectState } from './view.js';

/** How many recent action ids are kept per room for idempotent retries. */
export const RECENT_ACTION_LIMIT = 32;
/** How many guesses / moves a match may ever record, so a stuck room cannot grow without bound. */
export const MAX_MOVE_LOG = 400;

/**
 * A room failure with a machine-readable code. The client maps `code` to a sentence; the message is
 * only a developer-facing fallback.
 */
export class RoomError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Record<string, any>} [details]
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RoomError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Runs one engine call, turning a plain engine `Error` (a player made an illegal move) into a coded
 * `RoomError` the browser can translate. A real programming mistake in an engine is not hidden: it
 * still surfaces, but with a stable code instead of a stack trace through the callable.
 * @param {() => any} work
 */
function engineCall(work) {
  try {
    return work();
  } catch (error) {
    if (error instanceof RoomError) throw error;
    throw new RoomError('illegal-move', error?.message || 'That move is not allowed.', { engineMessage: error?.message ?? '' });
  }
}

/** @param {Record<string, any>} room @param {number} nowMs */
export function isRoomExpired(room, nowMs) {
  const createdAt = Number(room?.createdAt);
  if (!Number.isFinite(createdAt)) return true;
  return nowMs >= createdAt + ROOM_TTL_MS;
}

/** @param {Record<string, any>} room */
export function roomPlayers(room) {
  return (room.playerUids || []).map((uid, index) => ({
    uid,
    name: room.playerNames?.[uid] || `Player ${index + 1}`,
  }));
}

/** @param {Record<string, any>} room @param {string} uid */
export function isMember(room, uid) {
  return Array.isArray(room?.playerUids) && room.playerUids.includes(uid);
}

/**
 * @param {Record<string, any>} room
 * @param {number} nowMs
 * @throws {RoomError} when the room cannot be used at all
 */
export function assertUsable(room, nowMs) {
  if (!room) throw new RoomError('room-not-found', 'That room does not exist.');
  if (isRoomExpired(room, nowMs)) throw new RoomError('room-expired', EXPIRED_ROOM_MESSAGE);
}

/**
 * A fresh room, with the host's first game state.
 *
 * @param {object} input
 * @param {string} input.roomId
 * @param {Record<string, any>} input.game a game from shared/games.js
 * @param {{ uid: string, name: string }} input.host
 * @param {number} input.maxPlayers
 * @param {string} input.seed
 * @param {number} input.nowMs
 * @param {Record<string, any>} input.engines the engine registry
 * @param {number} [input.revision]
 */
export function createRoom({ roomId, game, host, maxPlayers, seed, nowMs, engines, revision = 1 }) {
  if (!game) throw new RoomError('unknown-game', 'Choose one of the games in the catalog.');
  if (![2, 3].includes(Number(maxPlayers))) throw new RoomError('bad-room-size', 'Choose a room size of 2 or 3 players.');
  const players = [{ uid: host.uid, name: host.name }];
  const state = engineCall(() => engines.createInitialGameState(game, players, seed));
  const room = {
    hostUid: host.uid,
    hostName: host.name,
    gameId: game.id,
    playerUids: [host.uid],
    playerNames: { [host.uid]: host.name },
    maxPlayers: Number(maxPlayers),
    status: 'waiting',
    state: projectState(game, state, host.uid).publicState,
    winnerUid: null,
    createdAt: nowMs,
    updatedAt: nowMs,
    expiresAt: nowMs + ROOM_TTL_MS,
    backend: 1,
    revision,
  };
  return {
    room,
    secret: { state, engineId: game.engine, revision, recentActionIds: [], taps: {}, roomId },
  };
}

/**
 * Take a free seat. Rejoining a room you are already in is a no-op, not an error, so a reload or a
 * second tab works.
 *
 * @param {object} input
 * @param {Record<string, any>} input.room
 * @param {Record<string, any>} input.secret
 * @param {{ uid: string, name: string }} input.user
 * @param {number} input.nowMs
 * @param {Record<string, any>} input.engines
 */
export function joinRoom({ room, secret, user, nowMs, engines }) {
  assertUsable(room, nowMs);
  const game = engines.gameById?.(room.gameId) ?? null;
  if (isMember(room, user.uid)) return { room, secret, rejoined: true };
  if (room.status === 'playing') throw new RoomError('room-started', 'This match has already started. Ask the host for a new room.');
  if (room.status === 'finished') throw new RoomError('room-finished', 'This match is over. Ask the host for a fresh invite link.');
  if ((room.playerUids || []).length >= room.maxPlayers) throw new RoomError('room-full', 'This room is full. Ask the host for another invite.');
  const nextRoom = { ...room };
  const nextUids = [...room.playerUids, user.uid];
  const nextNames = { ...(room.playerNames || {}), [user.uid]: user.name };
  nextRoom.playerUids = nextUids;
  nextRoom.playerNames = nextNames;
  nextRoom.updatedAt = nowMs;
  // A new player changes everyone's engine state (decks, fleets, order), so the state is rebuilt
  // from the same room seed: joining is not a way to peek at a running game.
  const players = nextUids.map((uid, index) => ({ uid, name: nextNames[uid] || `Player ${index + 1}` }));
  const nextState = engineCall(() => engines.createInitialGameState(game, players, room.id || secret.roomId || room.gameId));
  nextRoom.state = projectState(game, nextState, user.uid).publicState;
  return {
    room: nextRoom,
    secret: { ...secret, state: nextState, engineId: game?.engine || secret.engineId, revision: (secret.revision || 1) + 1, recentActionIds: [] },
    rejoined: false,
  };
}

/**
 * Give a waiting seat back. Once a match is running, leaving is presence, not a write: the seat and
 * the score stay, so a disconnected player can rejoin.
 *
 * @param {object} input
 * @param {Record<string, any>} input.room
 * @param {Record<string, any>} input.secret
 * @param {string} input.uid
 * @param {number} input.nowMs
 * @param {Record<string, any>} input.engines
 * @returns {{ room: Record<string, any>, secret: Record<string, any>, deleted: boolean }}
 */
export function leaveRoom({ room, secret, uid, nowMs, engines }) {
  assertUsable(room, nowMs);
  if (!isMember(room, uid)) throw new RoomError('not-in-room', 'You are not in this room.');
  if (room.status !== 'waiting') return { room, secret, deleted: false, left: true };
  const remaining = room.playerUids.filter((memberUid) => memberUid !== uid);
  if (!remaining.length) return { room, secret, deleted: true, left: true };
  const names = { ...room.playerNames };
  delete names[uid];
  const nextRoom = { ...room, playerUids: remaining, playerNames: names, updatedAt: nowMs };
  const game = engines.gameById?.(room.gameId) ?? null;
  const players = remaining.map((memberUid, index) => ({ uid: memberUid, name: names[memberUid] || `Player ${index + 1}` }));
  const nextState = engineCall(() => engines.createInitialGameState(game, players, room.id || secret.roomId || room.gameId));
  nextRoom.state = projectState(game, nextState, remaining[0]).publicState;
  // The host cannot leave the lobby and abandon the room: the next player takes over.
  if (room.hostUid === uid) {
    nextRoom.hostUid = remaining[0];
    nextRoom.hostName = names[remaining[0]] || 'Player';
  }
  return { room: nextRoom, secret: { ...secret, state: nextState, engineId: game?.engine || secret.engineId, revision: (secret.revision || 1) + 1 }, deleted: false, left: true };
}

/**
 * Start the match: host only, at least two seats filled.
 * @param {object} input
 */
export function startRoom({ room, secret, uid, nowMs }) {
  assertUsable(room, nowMs);
  if (!isMember(room, uid)) throw new RoomError('not-in-room', 'You are not in this room.');
  if (room.hostUid !== uid) throw new RoomError('host-only', 'Only the host can start this room.');
  if (room.status !== 'waiting') throw new RoomError('already-started', 'This match has already started.');
  if ((room.playerUids || []).length < 2) throw new RoomError('needs-players', 'Invite at least one friend before starting.');
  return {
    room: { ...room, status: 'playing', updatedAt: nowMs, revision: (room.revision || 0) + 1 },
    secret,
  };
}

/**
 * Host handoff: if the host's heartbeat says they are gone, the longest-seated other player takes
 * the lobby over. Only while waiting — a running match keeps its host for the rematch button.
 *
 * @param {object} input
 * @param {Record<string, any>} input.room
 * @param {number} input.nowMs
 * @param {Record<string, { status?: string, lastSeenAtMs?: number }>} input.presence keyed by uid
 * @param {number} input.graceMs
 */
export function handoffHost({ room, nowMs, presence, graceMs }) {
  if (room.status !== 'waiting') return { room, changed: false };
  const hostUid = room.hostUid;
  const host = presence?.[hostUid];
  const hostGone = !host || host.status === 'left' || (Number.isFinite(host.lastSeenAtMs) && nowMs - host.lastSeenAtMs > graceMs);
  if (!hostGone) return { room, changed: false };
  const heir = (room.playerUids || []).find((uid) => uid !== hostUid);
  if (!heir) return { room, changed: false };
  return {
    room: {
      ...room,
      hostUid: heir,
      hostName: room.playerNames?.[heir] || 'Player',
      updatedAt: nowMs,
      hostHandoffAt: nowMs,
      revision: (room.revision || 0) + 1,
    },
    changed: true,
  };
}

/**
 * Keep only the keys the engine understands. Anything else is refused instead of stored, so a
 * client cannot park arbitrary data (or a huge payload) inside a room's move log.
 * @param {string} engineId
 * @param {Record<string, any>} action
 */
export function sanitizeAction(engineId, action) {
  const allowed = ACTION_KEYS[engineId];
  if (!allowed) throw new RoomError('unknown-engine', 'This game mode is not available.');
  if (!action || typeof action !== 'object' || Array.isArray(action)) throw new RoomError('bad-action', 'That move was not understood.');
  const clean = {};
  for (const key of Object.keys(action)) {
    if (!allowed.includes(key)) throw new RoomError('bad-action-field', `That move carries an unexpected "${key}" field.`);
    clean[key] = action[key];
  }
  if (!Object.keys(clean).length) throw new RoomError('empty-action', 'That move was empty.');
  return clean;
}

/**
 * Apply one move.
 *
 * @param {object} input
 * @param {Record<string, any>} input.room
 * @param {Record<string, any>} input.secret
 * @param {string} input.uid
 * @param {Record<string, any>} input.action
 * @param {number} input.nowMs
 * @param {Record<string, any>} input.engines
 * @param {string} [input.clientActionId] retry-safe id chosen by the client
 * @returns {{ applied: boolean, duplicate: boolean, room: Record<string, any>, secret: Record<string, any>, accepted?: number, rejected?: number }}
 */
export function playMove({ room, secret, uid, action, nowMs, engines, clientActionId = '' }) {
  assertUsable(room, nowMs);
  if (!isMember(room, uid)) throw new RoomError('not-in-room', 'You are not in this room.');
  if (room.status !== 'playing') throw new RoomError('not-playing', room.status === 'finished' ? 'This match is already over.' : 'The host has not started the match yet.');
  const game = engines.gameById?.(room.gameId) ?? null;
  if (!game) throw new RoomError('unknown-game', 'This room points to a game that is not in the catalog.');
  const recentActionIds = Array.isArray(secret.recentActionIds) ? secret.recentActionIds : [];
  if (clientActionId && recentActionIds.includes(clientActionId)) {
    // A retry of an action the server already applied: answer with the current truth, do not apply it twice.
    return { applied: false, duplicate: true, room, secret };
  }
  const clean = sanitizeAction(game.engine, action);
  let state = secret.state;
  let accepted = 1;
  let rejected = 0;

  if (game.engine === 'race') {
    if (clean.type !== 'tap') throw new RoomError('bad-action', 'Tap the boost button to score.');
    const gapMs = Number(state.tapGapMs) || 0;
    // A fresh player starts with the burst allowance, not an empty bucket: otherwise the very first
    // tap of the match would be refused, which punishes an honest fast player for the server's
    // bookkeeping. The bucket is then refilled by elapsed time, exactly like `takeTapTokens` says.
    const bucket = secret.taps?.[uid] ?? { gapMs, tokens: RACE_BURST_TAPS, lastAtMs: nowMs };
    const requested = Math.max(1, Math.min(Number(clean.count) || 1, RACE_MAX_TAPS_PER_CALL));
    const taken = takeTapTokens({ gapMs, tokens: bucket.tokens, lastAtMs: bucket.lastAtMs }, requested, nowMs);
    const permitted = taken.accepted;
    secret = { ...secret, taps: { ...(secret.taps || {}), [uid]: taken.next } };
    let counted = 0;
    for (let tap = 0; tap < permitted; tap += 1) {
      // Taps past the winning one are dropped rather than rejected with an engine error.
      if (state.phase === 'finished') break;
      state = engineCall(() => engines.applyGameAction(game, state, uid, { type: 'tap' }, roomPlayers(room)));
      counted += 1;
    }
    accepted = counted;
    rejected = requested - counted;
    if (accepted === 0) {
      return { applied: false, duplicate: false, room, secret, accepted: 0, rejected };
    }
  } else {
    state = engineCall(() => engines.applyGameAction(game, state, uid, clean, roomPlayers(room)));
  }

  const nextRevision = (secret.revision || Number(room.revision) || 1) + 1;
  const nextRecent = clientActionId ? [...recentActionIds, clientActionId].slice(-RECENT_ACTION_LIMIT) : recentActionIds;
  const nextSecret = { ...secret, state, revision: nextRevision, recentActionIds: nextRecent };
  const nextRoom = { ...room, revision: nextRevision, updatedAt: nowMs };
  if (state.phase === 'finished') {
    nextRoom.status = 'finished';
    nextRoom.winnerUid = state.winnerUid ?? null;
    nextRoom.finishedAt = nowMs;
  }
  // Every player gets the projection that belongs to them; the caller writes the public half to the
  // room document and each private half to that player's own document.
  nextRoom.state = projectState(game, state, uid).publicState;
  return { applied: true, duplicate: false, room: nextRoom, secret: nextSecret, accepted, rejected };
}

/**
 * "Play again": the host resets a finished room with a fresh seed.
 * @param {object} input
 */
export function rematchRoom({ room, secret, uid, nowMs, seed, engines }) {
  assertUsable(room, nowMs);
  if (!isMember(room, uid)) throw new RoomError('not-in-room', 'You are not in this room.');
  if (room.hostUid !== uid) throw new RoomError('host-only', 'Only the room host can reset the game.');
  if (room.status !== 'finished') throw new RoomError('not-finished', 'This match is still running.');
  const game = engines.gameById?.(room.gameId) ?? null;
  if (!game) throw new RoomError('unknown-game', 'This room points to a game that is not in the catalog.');
  const players = roomPlayers(room);
  const state = engineCall(() => engines.createInitialGameState(game, players, seed));
  const revision = (secret.revision || Number(room.revision) || 1) + 1;
  const nextRoom = {
    ...room,
    status: 'playing',
    winnerUid: null,
    state: projectState(game, state, uid).publicState,
    updatedAt: nowMs,
    revision,
  };
  delete nextRoom.finishedAt;
  return { room: nextRoom, secret: { state, engineId: game.engine, revision, recentActionIds: [], taps: {}, roomId: room.id || secret.roomId } };
}

/**
 * The public state every member sees. `projectState` is deliberately called without a player uid
 * where it can be, and the per-player halves are collected separately by `privateStatesFor`, so the
 * room document can never end up with one player's private data in it.
 * @param {Record<string, any>} game
 * @param {Record<string, any>} secret
 */
export function publicStateFor(game, secret) {
  return projectState(game, secret?.state ?? {}, '').publicState;
}

/**
 * The private documents to write: one per player who has fields the others must not see.
 * @param {Record<string, any>} game
 * @param {Record<string, any>} secret
 * @param {Record<string, any>} room
 * @returns {Record<string, Record<string, any>>} keyed by uid, empty when nobody has a private view
 */
export function privateStatesFor(game, secret, room) {
  const policy = ENGINE_POLICY[game?.engine];
  if (!policy?.privateView || !secret?.state) return {};
  const docs = {};
  for (const uid of room.playerUids || []) {
    const { privateState } = projectState(game, secret.state, uid);
    if (privateState) docs[uid] = privateState;
  }
  return docs;
}

/** Room sizes are between 2 and 3 seats. */
export { MAX_ROOM_PLAYERS };
