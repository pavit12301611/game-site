/**
 * User preferences: favorites, recent games, display name.
 */

import { state } from '../state.js';
import { render } from '../render.js';
import { toggleFavoriteGameId, recordRecentGameId, saveStoredGameIds, FAVORITES_STORAGE_KEY, RECENT_STORAGE_KEY } from '../helpers.js';
import { GAMES } from '../catalog.js';

const validIds = new Set(GAMES.map(g => g.id));

/**
 * Toggles a game in favorites.
 */
export function toggleFavorite(gameId) {
  state.favorites = toggleFavoriteGameId(state.favorites, gameId, validIds, localStorage);
  render();
}

/**
 * Records a game as recently played.
 */
export function recordRecentGame(gameId) {
  state.recentGames = recordRecentGameId(state.recentGames, gameId, validIds, 8, localStorage);
}