/**
 * This device's preferences and history: favorites, recently played, and the guest display name.
 *
 * All of it lives in localStorage, so none of it needs an account and none of it is sent anywhere.
 * A browser with localStorage disabled (private windows, strict settings) simply loses the feature:
 * every write is wrapped, so the app never throws because of a preference.
 */

import { LIBRARY as GAMES } from '../catalog.js';
import { recordRecentGameId, toggleFavoriteGameId } from '../helpers.js';
import { state } from '../state.js';
import { showToast } from './toast.js';

export function recordRecentGame(gameId) {
  state.recentGames = recordRecentGameId(state.recentGames, gameId, new Set(GAMES.map((game) => game.id)), 8, localStorage);
}

export function toggleFavorite(gameId) {
  state.favorites = toggleFavoriteGameId(state.favorites, gameId, new Set(GAMES.map((game) => game.id)), localStorage);
  const game = GAMES.find(game => game.id === gameId);
  showToast(`${game?.title || 'Game'} ${state.favorites.includes(gameId) ? 'added to favorites' : 'removed from favorites'}.`);
}
