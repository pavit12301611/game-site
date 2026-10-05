/**
 * Splitting a game state into "what everyone may see" and "what stays on the server".
 *
 * This is the module that makes hidden information actually hidden. Online rooms keep the full
 * engine state (code secrets, fleets, the quiz answer keys, card faces, locked picks) in a
 * server-only document; the public room document holds only the projection below, and a player's
 * personal document holds the few fields that belong to them alone (their own fleet).
 *
 * Rules to keep when editing:
 *
 *   - Never add a field to a public projection because it is convenient. If a client needs it,
 *     either it is already revealed (a hit, a finished round) or it belongs in a private view.
 *   - Never send a seed, an item id or an answer key: a client that can recompute the secret has the
 *     secret, no matter how the field is named.
 *   - A key that is absent is safer than a key that is nulled, because "absent" cannot be mistaken
 *     for a revealed value by a renderer.
 */

import { ENGINE_POLICY } from './policy.js';

/** Fields the room document owns that the projections must never overwrite. */
const ROOM_FIELDS = new Set(['id', 'hostUid', 'hostName', 'gameId', 'playerUids', 'playerNames', 'maxPlayers', 'status', 'createdAt', 'updatedAt', 'expiresAt', 'backend', 'winnerUid', 'revision']);

/**
 * @param {Record<string, any>} state the full engine state
 * @param {string} uid the player asking
 * @returns {{ publicState: Record<string, any>, privateState: Record<string, any> | null }}
 */
export function projectState(game, state, uid) {
  const policy = ENGINE_POLICY[game?.engine] ?? { hidden: true, optimistic: false, privateView: false };
  if (!policy.hidden) return { publicState: { ...state }, privateState: null };

  switch (game.engine) {
    case 'memory': {
      // A card face is published only once the card is on the table (opened) or taken (matched).
      const shown = new Set([...(state.matched || []), ...(state.opened || [])]);
      return {
        publicState: { ...state, cards: (state.cards || []).map((face, index) => (shown.has(index) ? face : null)) },
        privateState: null,
      };
    }
    case 'quiz': {
      const { items, answers, deck, ...rest } = state;
      void items; void answers; void deck;
      // `lastRound` (which carries the revealed answer) is already part of `rest` and only exists
      // once every player has answered, which is exactly when revealing is fair.
      return { publicState: { ...rest }, privateState: null };
    }
    case 'rps': {
      const { picks, ...rest } = state;
      return {
        // Who has locked in is public; what they picked is not, until `lastRound` reveals it.
        publicState: { ...rest, lockedUids: Object.keys(picks || {}) },
        privateState: null,
      };
    }
    case 'battle': {
      const { ships, ...rest } = state;
      return {
        publicState: { ...rest },
        privateState: { myShips: [...(ships?.[uid] || [])] },
      };
    }
    case 'code': {
      const { secret, ...rest } = state;
      void secret; // the code stays in the server-only document; the public half never carries it
      return { publicState: { ...rest }, privateState: null };
    }
    default:
      return { publicState: { ...state }, privateState: null };
  }
}

/**
 * The full state a renderer should draw: the public projection plus the player's private fields.
 * The client calls this on every snapshot, so the merge lives here instead of in the view layer.
 * @param {Record<string, any>} publicState
 * @param {Record<string, any> | null | undefined} privateState
 * @returns {Record<string, any>}
 */
export function mergeView(publicState, privateState) {
  if (!publicState) return publicState;
  if (!privateState) return publicState;
  return { ...publicState, ...privateState };
}

/**
 * The document a client may write and read: a room with its public state only.
 * @param {Record<string, any>} room
 * @returns {Record<string, any>}
 */
export function publicRoomDocument(room) {
  const doc = {};
  for (const [key, value] of Object.entries(room)) {
    if (ROOM_FIELDS.has(key) && key !== 'id') doc[key] = value;
  }
  return doc;
}

/**
 * A short, human-readable room code: the first characters of the room id, upper-cased. The full id
 * stays the invite secret; the code exists so someone can type what a friend reads out loud.
 * @param {string} roomId
 * @param {number} length
 */
export function roomCode(roomId, length = 7) {
  return String(roomId || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, length).toUpperCase();
}

/**
 * The biggest state a room may carry. A room document is limited to 1 MiB and the public projection
 * is written on every move, so an oversized state is rejected loudly instead of failing halfway.
 */
export const MAX_STATE_BYTES = 200 * 1024;

/** @param {unknown} value @returns {number} the UTF-8 byte size of the JSON form of `value`. */
export function jsonBytes(value) {
  const text = JSON.stringify(value ?? null);
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  let bytes = 0;
  for (const char of text) bytes += (char.codePointAt(0) ?? 0) > 0x7f ? 3 : 1;
  return bytes;
}
