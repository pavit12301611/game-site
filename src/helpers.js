/**
 * Pure helper functions used across the app.
 */

export {
  DISPLAY_NAME_MAX,
  USERNAME_REGEX,
  sanitizeUsernameSeed,
  suggestUsername,
  validateUsername,
} from '../shared/online/identity.js';

export const THEME_STORAGE_KEY = 'psd-theme-preference';
export const FAVORITES_STORAGE_KEY = 'psd-favorite-games';
export const RECENT_STORAGE_KEY = 'psd-recent-games';
export const SOUND_STORAGE_KEY = 'psd-sound-enabled';
export const DISPLAY_NAME_STORAGE_KEY = 'psd-display-name';
export const KNOWN_ROOMS_STORAGE_KEY = 'psd-known-rooms';

/** Every room automatically expires and is deleted 1 hour after creation. */
export const ROOM_TTL_MS = 60 * 60 * 1000;
export const EXPIRED_ROOM_MESSAGE = 'This room expired after 1 hour and was automatically deleted.';

/** Normalizes a stored theme preference. */
export function normalizeThemePreference(value) {
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  return 'system';
}

/** Reads the persisted theme preference from localStorage. */
export function getStoredThemePreference(storage = globalThis.localStorage) {
  try {
    return normalizeThemePreference(storage?.getItem?.(THEME_STORAGE_KEY));
  } catch { return 'system'; }
}

/** Resolves the active theme from a user preference and OS setting. */
export function resolveTheme(preference = 'system', systemPrefersLight = false) {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  return systemPrefersLight ? 'light' : 'dark';
}

/** Saves the user's theme preference to storage. */
export function saveThemePreference(preference, storage = globalThis.localStorage) {
  const normalized = normalizeThemePreference(preference);
  try { storage?.setItem?.(THEME_STORAGE_KEY, normalized); } catch { /* ignore */ }
  return normalized;
}

/** Returns the opposite theme when toggling. */
export function nextToggledTheme(currentResolvedTheme = 'dark') {
  return currentResolvedTheme === 'light' ? 'dark' : 'light';
}

/** Loads a validated list of game IDs from localStorage. */
export function loadStoredGameIds(storage, key, validIds = null, maxItems = 40) {
  try {
    const raw = storage?.getItem?.(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
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
  } catch { return []; }
}

/** Saves a list of game IDs to localStorage. */
export function saveStoredGameIds(storage, key, ids) {
  try { storage?.setItem?.(key, JSON.stringify(ids)); } catch { /* ignore */ }
}

/** Toggles a gameId in the favorites array. */
export function toggleFavoriteGameId(favorites = [], gameId = '', validIds = null, storage = null) {
  const id = String(gameId || '').trim();
  if (!id || (validIds && !validIds.has(id))) return [...favorites];
  const exists = favorites.includes(id);
  const next = exists ? favorites.filter(item => item !== id) : [id, ...favorites.filter(item => item !== id)];
  if (storage) saveStoredGameIds(storage, FAVORITES_STORAGE_KEY, next);
  return next;
}

/** Prepends a gameId to the recently played list. */
export function recordRecentGameId(recent = [], gameId = '', validIds = null, maxItems = 8, storage = null) {
  const id = String(gameId || '').trim();
  if (!id || (validIds && !validIds.has(id))) return [...recent];
  const next = [id, ...recent.filter(item => item !== id)].slice(0, maxItems);
  if (storage) saveStoredGameIds(storage, RECENT_STORAGE_KEY, next);
  return next;
}

/** Converts a Firestore Timestamp or Date into ms. */
export function timestampToMillis(value) {
  if (value === null || value === undefined) return null;
  if (typeof value.toMillis === 'function') { const ms = value.toMillis(); return Number.isFinite(ms) ? ms : null; }
  if (typeof value.toDate === 'function') { const d = value.toDate(); return d instanceof Date && Number.isFinite(d.getTime()) ? d.getTime() : null; }
  if (typeof value.seconds === 'number') return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') { const ms = Date.parse(value); return Number.isFinite(ms) ? ms : null; }
  return null;
}

/** Returns the creation timestamp of a room in ms. */
export function roomCreatedAtMs(room) {
  if (!room || typeof room !== 'object') return null;
  return timestampToMillis(room.createdAt) ?? timestampToMillis(room.updatedAt);
}

/** Whether a room is expired. */
export function isRoomExpired(room, nowMs = Date.now(), ttlMs = ROOM_TTL_MS) {
  const createdMs = roomCreatedAtMs(room);
  if (createdMs === null) return false;
  return nowMs - createdMs >= ttlMs;
}

/** Milliseconds left before a room expires. */
export function roomRemainingMs(room, nowMs = Date.now(), ttlMs = ROOM_TTL_MS) {
  const createdMs = roomCreatedAtMs(room);
  if (createdMs === null) return null;
  return Math.max(0, createdMs + ttlMs - nowMs);
}