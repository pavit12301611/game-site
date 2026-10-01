/**
 * The single app state object and the four things derived from it.
 *
 * It is a plain mutable object on purpose: the whole UI is re-rendered from it with `render()`. This
 * module owns the shape; the modules that change it (`src/app.js` today, the room/account/social
 * modules later) import the same reference.
 */
import {
  DISPLAY_NAME_STORAGE_KEY,
  FAVORITES_STORAGE_KEY,
  RECENT_STORAGE_KEY,
  SOUND_STORAGE_KEY,
  getStoredThemePreference,
  loadStoredGameIds,
  resolveTheme,
} from './helpers.js';
import { GAMES, getGame } from './catalog.js';

/**
 * @type {Record<string, any>}
 *   The shape is documented by the literal below. Individual fields get precise types as the
 *   modules that own them are extracted in item 91.
 */
export const state = {
  page: 'home',
  query: '',
  focusSearchAfterRoute: false,
  category: 'All games',
  user: null,
  profile: null,
  isAdmin: false,
  room: null,
  roomId: null,
  roomError: '',
  local: null,
  modal: null,
  toast: null,
  friendResults: [],
  friendSearchTerm: '',
  friends: [],
  requests: [],
  invites: [],
  adminData: null,
  adminLoading: false,
  selectedBattleTarget: '',
  codeDraft: [0, 0, 0, 0],
  displayName: localStorage.getItem(DISPLAY_NAME_STORAGE_KEY) || '',
  themePreference: getStoredThemePreference(),
  resolvedTheme: resolveTheme(getStoredThemePreference(), window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false),
  soundEnabled: localStorage.getItem(SOUND_STORAGE_KEY) === 'true',
  favorites: loadStoredGameIds(localStorage, FAVORITES_STORAGE_KEY, new Set(GAMES.map((game) => game.id))),
  recentGames: loadStoredGameIds(localStorage, RECENT_STORAGE_KEY, new Set(GAMES.map((game) => game.id))),
  online: navigator.onLine !== false,
  redirectChecked: false,
  authError: '',
  socialError: '',
  liveCheck: null,
  cpuTimer: null,
  cpuPending: false,
};

export function currentUid() {
  return state.local ? 'local-you' : state.user?.uid || '';
}

export function currentGame() {
  if (state.local) return getGame(state.local.gameId);
  return state.room ? getGame(state.room.gameId) : null;
}

export function currentPlayers() {
  if (state.local) return state.local.players;
  if (!state.room) return [];
  return (state.room.playerUids || []).map((uid, index) => ({
    uid,
    name: state.room.playerNames?.[uid] || `Player ${index + 1}`,
  }));
}

export function currentGameState() {
  return (/** @type {any} */ (state.local)?.gameState) || (/** @type {any} */ (state.room)?.state) || null;
}
