import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FAVORITES_STORAGE_KEY,
  RECENT_STORAGE_KEY,
  THEME_STORAGE_KEY,
  getStoredThemePreference,
  loadStoredGameIds,
  nextToggledTheme,
  recordRecentGameId,
  resolveTheme,
  sanitizeUsernameSeed,
  saveThemePreference,
  suggestUsername,
  toggleFavoriteGameId,
  validateUsername,
} from '../src/helpers.js';

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test('username helpers sanitize Google names and enforce the existing format', () => {
  assert.equal(sanitizeUsernameSeed('  Zoë Rivera! '), 'zoe_rivera');
  assert.equal(suggestUsername('Zoë Rivera', 'zoe@example.com'), 'zoe_rivera');
  assert.equal(suggestUsername('', 'A@example.com'), 'a_player');
  assert.equal(validateUsername('Pixel_Pilot').ok, true);
  assert.equal(validateUsername('no spaces').ok, false);
  assert.equal(validateUsername('ab').ok, false);
  assert.equal(validateUsername('this_username_is_way_too_long').ok, false);
});

test('theme helpers persist an explicit preference and follow system only when requested', () => {
  const storage = makeStorage();
  assert.equal(getStoredThemePreference(storage), 'system');
  assert.equal(saveThemePreference('light', storage), 'light');
  assert.equal(storage.getItem(THEME_STORAGE_KEY), 'light');
  assert.equal(resolveTheme('light', false), 'light');
  assert.equal(resolveTheme('dark', true), 'dark');
  assert.equal(resolveTheme('system', true), 'light');
  assert.equal(resolveTheme('system', false), 'dark');
  assert.equal(nextToggledTheme('light'), 'dark');
  assert.equal(nextToggledTheme('dark'), 'light');
});

test('favorite and recent game helpers keep validated, capped local lists', () => {
  const storage = makeStorage();
  const ids = new Set(['one', 'two', 'three']);
  let favorites = toggleFavoriteGameId([], 'one', ids, storage);
  assert.deepEqual(favorites, ['one']);
  assert.deepEqual(JSON.parse(storage.getItem(FAVORITES_STORAGE_KEY)), ['one']);
  favorites = toggleFavoriteGameId(favorites, 'one', ids, storage);
  assert.deepEqual(favorites, []);
  favorites = toggleFavoriteGameId(favorites, 'missing', ids, storage);
  assert.deepEqual(favorites, []);

  let recent = recordRecentGameId([], 'one', ids, 2, storage);
  recent = recordRecentGameId(recent, 'two', ids, 2, storage);
  recent = recordRecentGameId(recent, 'one', ids, 2, storage);
  assert.deepEqual(recent, ['one', 'two']);
  assert.deepEqual(JSON.parse(storage.getItem(RECENT_STORAGE_KEY)), ['one', 'two']);
  assert.deepEqual(loadStoredGameIds(storage, RECENT_STORAGE_KEY, ids), ['one', 'two']);
});
