/**
 * Theme management: light/dark toggle, system preference, persistence.
 */

import { state } from '../state.js';
import { render } from '../render.js';
import { resolveTheme, saveThemePreference, nextToggledTheme } from '../helpers.js';

/**
 * Applies the theme to the document.
 * @param {string} preference  'light' | 'dark' | 'system'
 * @param {boolean} [fromMedia=false]  true when triggered by a media query change
 */
export function applyTheme(preference = 'system', fromMedia = false) {
  const systemLight = window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false;
  const resolved = resolveTheme(preference, systemLight);

  state.themePreference = preference;
  state.resolvedTheme = resolved;

  document.documentElement.setAttribute('data-theme', resolved);

  // Update theme-color meta tag
  const meta = document.getElementById('meta-theme-color');
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#f8f6f2' : '#14110f');

  if (!fromMedia) saveThemePreference(preference);
}

/**
 * Toggles between light and dark.
 */
export function toggleTheme() {
  const next = nextToggledTheme(state.resolvedTheme);
  applyTheme(next);
  render();
}