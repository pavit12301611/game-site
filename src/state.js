/**
 * The single app state object and derived getters.
 *
 * Plain mutable object: the whole UI re-renders from it with `render()`.
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
import { presenceVerdicts } from './presence-status.js';
import { isMaintenanceLocked, maintenancePassIsValid, MAINTENANCE_PIN_DEFAULT_HOURS } from '../shared/online/maintenance.js';

/** Starting digits of a code-breaking guess row. */
export const DEFAULT_CODE_DRAFT = Object.freeze([0, 0, 0, 0]);

/** @type {Record<string, any>} */
export const state = {
  page: 'home',
  routeNotice: '',
  query: '',
  focusSearchAfterRoute: false,
  category: 'All games',
  filters: { duration: 'Any length', difficulty: 'Any difficulty', input: 'Any input' },
  user: null,
  profile: null,
  isAdmin: false,
  room: null,
  roomId: null,
  roomError: '',
  onlineActionsPending: 0,
  presence: {},
  chatMessages: [],
  chatOpen: false,
  chatUnreadCount: 0,
  chatSending: false,
  chatError: '',
  presenceClockOffsetMs: 0,
  local: null,
  modal: null,
  toast: null,
  friendResults: [],
  friendSearchTerm: '',
  friends: [],
  requests: [],
  invites: [],
  blocked: [],
  adminData: null,
  adminLoading: false,
  adminTab: 'overview',
  reviews: [],
  featuredReview: null,
  featuredReviewError: '',
  reviewsLoading: false,
  reviewsHasMore: true,
  reviewsError: '',
  reviewSubmitting: false,
  reviewModelStatus: '',
  selectedBattleTarget: '',
  codeDraft: [...DEFAULT_CODE_DRAFT],
  displayName: localStorage.getItem(DISPLAY_NAME_STORAGE_KEY) || '',
  themePreference: getStoredThemePreference(),
  resolvedTheme: resolveTheme(getStoredThemePreference(), window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false),
  soundEnabled: localStorage.getItem(SOUND_STORAGE_KEY) === 'true',
  favorites: loadStoredGameIds(localStorage, FAVORITES_STORAGE_KEY, new Set(GAMES.map(game => game.id))),
  recentGames: loadStoredGameIds(localStorage, RECENT_STORAGE_KEY, new Set(GAMES.map(game => game.id))),
  online: navigator.onLine !== false,
  redirectChecked: false,
  authError: '',
  socialError: '',
  liveCheck: null,
  cpuTimer: null,
  cpuPending: false,
  maintenance: {
    status: 'pending',
    enabled: false,
    reason: '',
    updatedAtMs: 0,
    updatedByUid: '',
    pinHash: '',
    pinSalt: '',
    pinExpiresAtMs: 0,
    pinSetAtMs: 0,
    pinExpired: false,
    error: '',
    pass: null,
    attempts: { count: 0, lockedUntilMs: 0 },
    checking: false,
    saving: false,
    pinDraft: '',
    unlockMessage: '',
    unlockOk: false,
    preview: false,
    access: null,
    accessError: '',
    draft: { reason: '', hours: MAINTENANCE_PIN_DEFAULT_HOURS },
  },
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

export function maintenanceBlocks() {
  return isMaintenanceLocked(state.maintenance, {
    isAdmin: state.isAdmin,
    passValid: maintenancePassIsValid(state.maintenance.pass, state.maintenance),
  });
}

export function presenceNow() {
  return Date.now() + (state.presenceClockOffsetMs || 0);
}

/**
 * @returns {Record<string, import('./presence-status.js').PresenceVerdict>}
 */
export function currentPresence() {
  if (state.local || !state.room) return {};
  return presenceVerdicts(state.room.playerUids || [], state.presence || {}, presenceNow());
}