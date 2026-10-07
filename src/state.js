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
import { isMaintenanceLocked, maintenancePassIsValid, MAINTENANCE_PIN_DEFAULT_HOURS } from '../shared/online/maintenance.js';

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
  room: null,
  roomId: null,
  roomError: '',
  /** Inputs already drawn locally but not acknowledged by the room transaction yet. */
  onlineActionsPending: 0,
  /** uid -> { lastSeenMs, status } for the current online room (src/online/presence.js). */
  presence: {},
  /** In-match chat messages for the current live room (src/online/chat.js). Oldest first. */
  chatMessages: [],
  /** Whether the chat side-panel is currently open. */
  chatOpen: false,
  /** Number of new chat messages that arrived while the panel was closed (for the badge). */
  chatUnreadCount: 0,
  /** True while a chat message is being sent through the backend. */
  chatSending: false,
  /** Inline error shown under the chat input, if any. */
  chatError: '',
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
  displayName: (() => { try { return localStorage.getItem(DISPLAY_NAME_STORAGE_KEY) || ''; } catch { return ''; } })(),
  themePreference: getStoredThemePreference(),
  resolvedTheme: resolveTheme(getStoredThemePreference(), window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false),
  soundEnabled: (() => { try { return localStorage.getItem(SOUND_STORAGE_KEY) === 'true'; } catch { return true; } })(),
  favorites: (() => { try { return loadStoredGameIds(localStorage, FAVORITES_STORAGE_KEY, new Set(GAMES.map((game) => game.id))); } catch { return new Set(); } })(),
  recentGames: (() => { try { return loadStoredGameIds(localStorage, RECENT_STORAGE_KEY, new Set(GAMES.map((game) => game.id))); } catch { return new Set(); } })(),
  online: navigator.onLine !== false,
  redirectChecked: false,
  authError: '',
  socialError: '',
  liveCheck: null,
  cpuTimer: null,
  cpuPending: false,
  /**
   * Maintenance mode (src/maintenance.js, docs/maintenance-mode.md): a mirror of the public
   * `siteStatus/maintenance` document plus what this device remembers about it.
   *
   * `status` says how much to trust the rest: 'pending' before anything has been read, 'cached' when
   * the picture came from this browser's last visit, 'live' once Firestore answered, 'error' when the
   * read failed and 'unavailable' when Firebase never started (local practice mode).
   */
  maintenance: {
    status: 'pending',
    enabled: false,
    reason: '',
    updatedAtMs: 0,
    updatedByUid: '',
    /** The salted digest of the access code: what a typed code is compared with. Never the code. */
    pinHash: '',
    pinSalt: '',
    pinExpiresAtMs: 0,
    pinSetAtMs: 0,
    pinExpired: false,
    error: '',
    /** `{ digest, expiresAtMs }` for this device, or null. */
    pass: null,
    /** Wrong codes typed here, and any cooldown they earned. */
    attempts: { count: 0, lockedUntilMs: 0 },
    checking: false,
    /** True while the studio is writing either document. */
    saving: false,
    /** What is in the code box right now, so a repaint mid-typing does not swallow the digits. */
    pinDraft: '',
    /** The last answer to a typed code, shown under the box. */
    unlockMessage: '',
    unlockOk: false,
    /** An admin deliberately looking at the notice. */
    preview: false,
    /** Admin-only: the code itself, read from `maintenanceAccess/active` on demand. */
    access: null,
    accessError: '',
    /** What is in the studio's form right now, so a repaint does not lose a half-typed reason. */
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

/**
 * Must this viewer be shown the maintenance notice instead of the arcade?
 *
 * Three facts decide it, all of them already in `state`: the site is closed, this account is a
 * verified admin (or asked to preview the notice), and otherwise whether this device holds a pass
 * that still matches the current code. See `isMaintenanceLocked` for the order they are applied in.
 */
export function maintenanceBlocks() {
  return isMaintenanceLocked(state.maintenance, {
    isAdmin: state.isAdmin,
    passValid: maintenancePassIsValid(state.maintenance.pass, state.maintenance),
  });
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
