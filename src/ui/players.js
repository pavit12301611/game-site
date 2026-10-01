/**
 * Player presentation helpers: the name shown for a uid, a player's seat index, and the mark drawn
 * for that seat on the boards.
 */
import { currentPlayers } from '../state.js';

export function activeName(uid, players = currentPlayers()) {
  return players.find((player) => player.uid === uid)?.name || 'A player';
}

export function playerIndex(uid, players) {
  return players.findIndex((player) => player.uid === uid);
}

export function playerMark(index) {
  return ['✕', '◯', '◇'][Math.max(0, index) % 3];
}
