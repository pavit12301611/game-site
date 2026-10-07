/**
 * Player display helpers: names, colours, shapes.
 */

import { state } from '../state.js';

const PLAYER_COLORS = ['--p1', '--p2', '--p3', '--p4'];
const PLAYER_SHAPES = ['✕', '●', '◎', '◆'];

/**
 * Gets a player's display name.
 */
export function playerDisplayName(uid, players) {
  if (uid === 'local-you') return state.displayName || 'You';
  if (uid === 'local-cpu') return 'CPU';
  const player = players?.find(p => p.uid === uid);
  if (player?.name) return player.name;
  return state.room?.playerNames?.[uid] || 'Player';
}

/**
 * Gets the CSS variable for a player's colour.
 */
export function playerColor(index) {
  return `var(${PLAYER_COLORS[index % PLAYER_COLORS.length]})`;
}

/**
 * Gets the shape icon for a player.
 */
export function playerShape(index) {
  return PLAYER_SHAPES[index % PLAYER_SHAPES.length];
}