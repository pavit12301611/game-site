/**
 * The latency-compensation half of online moves.
 *
 * Firestore transactions are still the authority: they prevent two players from overwriting each
 * other. The browser does not need to wait for that round trip before drawing its own move, though.
 * These pure helpers apply an action to a room immediately, tag it with a small idempotency marker,
 * and can replay outstanding actions over a newer server snapshot.
 *
 * `onlineSync.recentActionIds` is deliberately bounded. It is only a short bridge between the
 * optimistic frame and the acknowledged snapshot, not an ever-growing match log.
 */

import { applyGameAction, getGame } from '../catalog.js';

export const ONLINE_ACTION_HISTORY_LIMIT = 48;

/** @param {Record<string, any> | null | undefined} gameState */
export function onlineRevision(gameState) {
  const revision = Number(gameState?.onlineSync?.revision);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

/** @param {Record<string, any> | null | undefined} gameState @param {string} actionId */
export function hasOnlineAction(gameState, actionId) {
  return Array.isArray(gameState?.onlineSync?.recentActionIds)
    && gameState.onlineSync.recentActionIds.includes(actionId);
}

/**
 * Return a state tagged with one applied action. The engine state is already a fresh clone, so this
 * only copies the nested sync object/array that this helper owns.
 * @param {Record<string, any>} gameState
 * @param {string} actionId
 * @returns {Record<string, any>}
 */
export function markOnlineAction(gameState, actionId) {
  const previous = Array.isArray(gameState?.onlineSync?.recentActionIds)
    ? gameState.onlineSync.recentActionIds.filter((id) => typeof id === 'string' && id !== actionId)
    : [];
  const recentActionIds = [...previous, actionId].slice(-ONLINE_ACTION_HISTORY_LIMIT);
  return {
    ...gameState,
    onlineSync: {
      revision: onlineRevision(gameState) + 1,
      recentActionIds,
    },
  };
}

/**
 * A rematch is a new state, but its sync revision still moves forward instead of silently jumping
 * back to zero. That keeps reconciliation metadata monotonic across the life of one room.
 * @param {Record<string, any>} freshState
 * @param {Record<string, any> | null | undefined} previousState
 */
export function markOnlineReset(freshState, previousState) {
  return {
    ...freshState,
    onlineSync: {
      revision: onlineRevision(previousState) + 1,
      recentActionIds: [],
    },
  };
}

/** @param {Record<string, any>} room */
function playersIn(room) {
  return (room.playerUids || []).map((uid, index) => ({
    uid,
    name: room.playerNames?.[uid] || `Player ${index + 1}`,
  }));
}

/**
 * Apply one action to a room without adding timestamps. This is used both for the instant local
 * frame and inside the eventual Firestore transaction, so both paths run exactly the same engine.
 *
 * @param {Record<string, any>} room
 * @param {string} uid
 * @param {Record<string, any>} action
 * @param {string} actionId
 */
export function roomAfterOnlineAction(room, uid, action, actionId) {
  if (hasOnlineAction(room.state, actionId)) return room;
  const players = playersIn(room);
  if (!players.some((player) => player.uid === uid)) throw new Error('You are no longer in this room.');
  const game = getGame(room.gameId);
  if (!game) throw new Error('This room points to a game that is not in the catalog.');
  const nextState = markOnlineAction(applyGameAction(game, room.state, uid, action, players), actionId);
  if (nextState.phase !== 'finished') return { ...room, state: nextState };
  return {
    ...room,
    state: nextState,
    status: 'finished',
    winnerUid: nextState.winnerUid ?? null,
  };
}

/**
 * Rebase this client's unacknowledged inputs over a fresh room snapshot. Already-acknowledged ids
 * are no-ops, which prevents the listener from drawing a move twice around commit time.
 *
 * @param {Record<string, any>} room
 * @param {string} uid
 * @param {Array<{ id: string, action: Record<string, any> }>} entries
 */
export function roomAfterOnlineActions(room, uid, entries) {
  let nextRoom = room;
  const appliedIds = [];
  for (const entry of entries) {
    if (hasOnlineAction(nextRoom.state, entry.id)) continue;
    nextRoom = roomAfterOnlineAction(nextRoom, uid, entry.action, entry.id);
    appliedIds.push(entry.id);
  }
  return { room: nextRoom, appliedIds };
}
