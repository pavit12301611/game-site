export const USERNAME_REGEX = /^[a-z0-9_]{3,18}$/;
export const THEME_STORAGE_KEY = 'psd-theme-preference';
export const FAVORITES_STORAGE_KEY = 'psd-favorite-games';
export const RECENT_STORAGE_KEY = 'psd-recent-games';
export const SOUND_STORAGE_KEY = 'psd-sound-enabled';
export const DISPLAY_NAME_STORAGE_KEY = 'psd-display-name';
export const KNOWN_ROOMS_STORAGE_KEY = 'psd-known-rooms';
/** Every room automatically expires and is deleted 1 hour after creation. */
export const ROOM_TTL_MS = 60 * 60 * 1000;
export const EXPIRED_ROOM_MESSAGE = 'This room expired after 1 hour and was automatically deleted.';

/**
 * Normalizes arbitrary text (such as a Google displayName or email prefix)
 * into lowercase characters valid for a PSD-gaming username: [a-z0-9_].
 */
export function sanitizeUsernameSeed(input = '') {
  const ascii = String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return ascii
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Suggests a valid 3-18 character PSD-gaming username from a display name
 * and/or email address, optionally appending a numeric/text suffix.
 */
export function suggestUsername(displayName = '', email = '', suffix = '') {
  const emailLocal = String(email || '').split('@')[0] || '';
  let base = sanitizeUsernameSeed(displayName);
  if (base.length < 3) {
    base = sanitizeUsernameSeed(emailLocal);
  }
  if (!base) {
    base = 'player';
  }
  if (base.length < 3) {
    base = `${base}_player`.replace(/^_+|_+$/g, '');
  }

  const cleanSuffix = sanitizeUsernameSeed(suffix);
  if (cleanSuffix) {
    const maxBaseLength = Math.max(3, 18 - cleanSuffix.length - 1);
    const trimmedBase = base.slice(0, maxBaseLength).replace(/_+$/g, '');
    const combined = `${trimmedBase}_${cleanSuffix}`.replace(/_+/g, '_').slice(0, 18).replace(/_+$/g, '');
    if (USERNAME_REGEX.test(combined)) return combined;
  }

  let candidate = base.slice(0, 18).replace(/_+$/g, '');
  while (candidate.length < 3) {
    candidate = `${candidate}x`;
  }
  return candidate.slice(0, 18);
}

/**
 * Validates a raw username string against PSD-gaming's 3-18 char [a-z0-9_] rule.
 */
export function validateUsername(rawUsername = '') {
  const username = String(rawUsername || '').trim();
  const usernameLower = username.toLowerCase();
  if (!username) {
    return {
      ok: false,
      username: '',
      usernameLower: '',
      error: 'Choose a username between 3 and 18 characters.',
    };
  }
  if (username.length < 3 || username.length > 18) {
    return {
      ok: false,
      username,
      usernameLower,
      error: 'Usernames must be 3–18 characters long.',
    };
  }
  if (!USERNAME_REGEX.test(usernameLower)) {
    return {
      ok: false,
      username,
      usernameLower,
      error: 'Usernames must be 3–18 characters: letters, numbers, or underscores.',
    };
  }
  return {
    ok: true,
    username,
    usernameLower,
    error: '',
  };
}

/**
 * Normalizes a stored theme preference ('light' | 'dark' | 'system').
 */
export function normalizeThemePreference(value) {
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  return 'system';
}

/**
 * Reads the persisted theme preference from a Storage-compatible object.
 */
export function getStoredThemePreference(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(THEME_STORAGE_KEY);
    return normalizeThemePreference(raw);
  } catch {
    return 'system';
  }
}

/**
 * Resolves the active theme ('light' | 'dark') from a user preference and OS setting.
 */
export function resolveTheme(preference = 'system', systemPrefersLight = false) {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  return systemPrefersLight ? 'light' : 'dark';
}

/**
 * Saves the user's theme preference ('light' | 'dark' | 'system') to storage.
 */
export function saveThemePreference(preference, storage = globalThis.localStorage) {
  const normalized = normalizeThemePreference(preference);
  try {
    storage?.setItem?.(THEME_STORAGE_KEY, normalized);
  } catch {
    // Ignore storage quota or privacy mode errors
  }
  return normalized;
}

/**
 * Returns the opposite theme when toggling directly between light and dark.
 */
export function nextToggledTheme(currentResolvedTheme = 'dark') {
  return currentResolvedTheme === 'light' ? 'dark' : 'light';
}

/**
 * Loads a validated list of game IDs from localStorage.
 * @param {Storage} storage
 * @param {string} key
 * @param {Set<string> | null} [validIds]
 * @param {number} [maxItems]
 * @returns {string[]}
 */
export function loadStoredGameIds(storage, key, validIds = null, maxItems = 40) {
  try {
    const raw = storage?.getItem?.(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    /** @type {Set<string>} */
    const seen = new Set();
    /** @type {string[]} */
    const result = [];
    for (const item of parsed) {
      const id = String(item || '').trim();
      if (!id || seen.has(id)) continue;
      if (validIds && !validIds.has(id)) continue;
      seen.add(id);
      result.push(id);
      if (result.length >= maxItems) break;
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * Saves a list of game IDs to localStorage.
 */
export function saveStoredGameIds(storage, key, ids) {
  try {
    storage?.setItem?.(key, JSON.stringify(ids));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Toggles a gameId in the favorites array and persists if storage is provided.
 * @param {string[]} favorites
 * @param {string} gameId
 * @param {Set<string> | null} [validIds]
 * @param {Storage | null} [storage]
 * @returns {string[]}
 */
export function toggleFavoriteGameId(favorites = [], gameId = '', validIds = null, storage = null) {
  const id = String(gameId || '').trim();
  if (!id || (validIds && !validIds.has(id))) return [...favorites];
  const exists = favorites.includes(id);
  const next = exists ? favorites.filter((item) => item !== id) : [id, ...favorites.filter((item) => item !== id)];
  if (storage) saveStoredGameIds(storage, FAVORITES_STORAGE_KEY, next);
  return next;
}

/**
 * Prepends a gameId to the recently played list (capped at maxItems) and persists if storage is provided.
 * @param {string[]} recent
 * @param {string} gameId
 * @param {Set<string> | null} [validIds]
 * @param {number} [maxItems]
 * @param {Storage | null} [storage]
 * @returns {string[]}
 */
export function recordRecentGameId(recent = [], gameId = '', validIds = null, maxItems = 8, storage = null) {
  const id = String(gameId || '').trim();
  if (!id || (validIds && !validIds.has(id))) return [...recent];
  const next = [id, ...recent.filter((item) => item !== id)].slice(0, maxItems);
  if (storage) saveStoredGameIds(storage, RECENT_STORAGE_KEY, next);
  return next;
}

/**
 * Converts a Firestore Timestamp, { seconds, nanoseconds }, Date, number or date string into ms.
 * @param {any} value
 * @returns {number | null}
 */
export function timestampToMillis(value) {
  if (value === null || value === undefined) return null;
  if (typeof value.toMillis === 'function') {
    const ms = value.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    const ms = date instanceof Date ? date.getTime() : NaN;
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value.seconds === 'number') {
    const nanos = typeof value.nanoseconds === 'number' ? value.nanoseconds : 0;
    return value.seconds * 1000 + Math.floor(nanos / 1e6);
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/**
 * Returns the creation timestamp of a room (or invite) in milliseconds, falling back to updatedAt.
 * @param {Record<string, any> | null | undefined} room
 * @returns {number | null}
 */
export function roomCreatedAtMs(room) {
  if (!room || typeof room !== 'object') return null;
  return timestampToMillis(room.createdAt) ?? timestampToMillis(room.updatedAt);
}

/**
 * Whether a room is at least 1 hour old (or `ttlMs` old) relative to `nowMs`.
 * @param {Record<string, any> | null | undefined} room
 * @param {number} [nowMs]
 * @param {number} [ttlMs]
 * @returns {boolean}
 */
export function isRoomExpired(room, nowMs = Date.now(), ttlMs = ROOM_TTL_MS) {
  const createdMs = roomCreatedAtMs(room);
  if (createdMs === null) return false;
  return nowMs - createdMs >= ttlMs;
}

/**
 * Milliseconds left before a room reaches its 1-hour expiry (`0` once expired, `null` if unknown).
 * @param {Record<string, any> | null | undefined} room
 * @param {number} [nowMs]
 * @param {number} [ttlMs]
 * @returns {number | null}
 */
export function roomRemainingMs(room, nowMs = Date.now(), ttlMs = ROOM_TTL_MS) {
  const createdMs = roomCreatedAtMs(room);
  if (createdMs === null) return null;
  return Math.max(0, createdMs + ttlMs - nowMs);
}

/**
 * @typedef {{ id: string, createdAtMs: number }} KnownRoomEntry
 */

/**
 * Reads the list of room IDs this browser created or joined so they can be swept after 1 hour.
 * @param { Pick<Storage, 'getItem'> | null | undefined } [storage]
 * @param {number} [maxItems]
 * @returns {KnownRoomEntry[]}
 */
export function loadKnownRooms(storage = globalThis.localStorage, maxItems = 50) {
  try {
    const raw = storage?.getItem?.(KNOWN_ROOMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    /** @type {Set<string>} */
    const seen = new Set();
    /** @type {KnownRoomEntry[]} */
    const entries = [];
    for (const item of parsed) {
      const id = String(item?.id || '').trim();
      const createdAtMs = timestampToMillis(item?.createdAtMs);
      if (!id || seen.has(id) || createdAtMs === null) continue;
      seen.add(id);
      entries.push({ id, createdAtMs });
      if (entries.length >= maxItems) break;
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Saves the known-room list to localStorage.
 * @param {KnownRoomEntry[]} entries
 * @param { Pick<Storage, 'setItem'> | null | undefined } [storage]
 * @param {number} [maxItems]
 */
export function saveKnownRooms(entries, storage = globalThis.localStorage, maxItems = 50) {
  try {
    const normalized = Array.isArray(entries) ? entries.slice(0, maxItems) : [];
    storage?.setItem?.(KNOWN_ROOMS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Storage is optional; ignore quota or privacy mode errors.
  }
}

/**
 * Splits known-room entries into expired (`>= ttlMs`) and still-active (`< ttlMs`), plus the delay
 * until the next active room expires.
 * @param {KnownRoomEntry[]} entries
 * @param {number} [nowMs]
 * @param {number} [ttlMs]
 * @returns {{ expired: KnownRoomEntry[], active: KnownRoomEntry[], nextDelayMs: number | null }}
 */
export function partitionKnownRooms(entries = [], nowMs = Date.now(), ttlMs = ROOM_TTL_MS) {
  /** @type {KnownRoomEntry[]} */
  const expired = [];
  /** @type {KnownRoomEntry[]} */
  const active = [];
  /** @type {number | null} */
  let nextDelayMs = null;
  for (const entry of entries) {
    const id = String(entry?.id || '').trim();
    const createdAtMs = timestampToMillis(entry?.createdAtMs);
    if (!id || createdAtMs === null) continue;
    const remaining = createdAtMs + ttlMs - nowMs;
    if (remaining <= 0) {
      expired.push({ id, createdAtMs });
    } else {
      active.push({ id, createdAtMs });
      if (nextDelayMs === null || remaining < nextDelayMs) nextDelayMs = remaining;
    }
  }
  return { expired, active, nextDelayMs };
}
