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
import { presenceVerdicts } from './presence-status.js';
import { safeMaintenanceStatus } from '../shared/online/maintenance.js';

/** The starting digits of a code-breaking guess row; the real range comes from the game's `symbols`. */
export const DEFAULT_CODE_DRAFT = Object.freeze([0, 0, 0, 0]);

/**
 * The shape is documented by the literal below. Individual fields get precise types as the modules
 * that own them are extracted.
 * @type {Record<string, any>}
 */
export const state = {
  page: 'home',
  /** Set when a hash route does not exist, so the recovery screen can say what happened. */
  routeNotice: '',
  query: '',
  focusSearchAfterRoute: false,
  category: 'All games',
  /** The real shelf filters: duration bucket, difficulty and input style (see views/pages.js). */
  filters: { duration: 'Any length', difficulty: 'Any difficulty', input: 'Any input' },
  user: null,
  profile: null,
  isAdmin: false,
  /**
   * The public maintenance document (`maintenance/status`), already normalised by
   * `safeMaintenanceStatus`: a missing or malformed document reads as `enabled: false`, so a broken
   * read can never close the arcade. `maintenanceUnlocked` is true for this tab after the backend
   * accepted a tester PIN; `maintenancePass` is that session's pass.
   */
  maintenance: safeMaintenanceStatus(null),
  maintenanceUnlocked: false,
  maintenancePass: null,
  /** What the maintenance page shows after a wrong or rate-limited PIN ('' when there is nothing). */
  maintenanceError: '',
  /** Shown once, right after the admin mints a PIN: the digits are never stored again. */
  adminMaintenancePin: null,
  room: null,
  roomId: null,
  roomError: '',
  /** Inputs already drawn locally but not acknowledged by the room transaction yet. */
  onlineActionsPending: 0,
  /** uid -> { lastSeenMs, status } for the current online room (src/online/presence.js). */
  presence: {},
  /** Server clock minus local clock, measured from our own heartbeat; 0 until known. */
  presenceClockOffsetMs: 0,
  local: null,
  modal: null,
  toast: null,
  friendResults: [],
  friendSearchTerm: '',
  friends: [],
  requests: [],
  invites: [],
  /** Blocks this account created: { id, blockerUid, blockedUid, createdAtMs } (owner-readable only). */
  blocked: [],
  adminData: null,
  adminLoading: false,
  /** Which admin studio section is open: overview | rooms | players | social | reviews | access. */
  adminTab: 'overview',
  /** Public reviews are readable without sign-in; new review writes still require a guest session. */
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

/** The server clock, as well as this client can tell: what presence ages are measured against. */
export function presenceNow() {
  return Date.now() + (state.presenceClockOffsetMs || 0);
}

/**
 * Who is still in the current online room, keyed by uid. Empty in local practice and before the
 * first presence snapshot, which renders exactly like the room did before presence existed.
 * @returns {Record<string, import('./presence-status.js').PresenceVerdict>}
 */
export function currentPresence() {
  if (state.local || !state.room) return {};
  return presenceVerdicts(state.room.playerUids || [], state.presence || {}, presenceNow());
}
