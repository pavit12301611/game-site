/**
 * Light, dark, or whatever the device asks for.
 *
 * The preference is stored; the *resolved* theme (what system + preference actually mean right now)
 * lives in `state.resolvedTheme` and is what the views read. A `data-theme` attribute on <html> lets
 * the stylesheet do the rest.
 */

import { getStoredThemePreference, nextToggledTheme, resolveTheme, saveThemePreference } from '../helpers.js';
import { state } from '../state.js';
import { showToast } from './toast.js';
import { render } from '../render.js';

export function systemPrefersLight() {
  return Boolean(window.matchMedia?.('(prefers-color-scheme: light)').matches);
}

export function applyTheme(preference = state.themePreference, shouldRender = false) {
  state.themePreference = saveThemePreference(preference);
  state.resolvedTheme = resolveTheme(state.themePreference, systemPrefersLight());
  document.documentElement.dataset.theme = state.resolvedTheme;
  document.documentElement.style.colorScheme = state.resolvedTheme;
  const themeMeta = document.querySelector('#meta-theme-color');
  if (themeMeta) themeMeta.setAttribute('content', state.resolvedTheme === 'light' ? '#f6f1e8' : '#14110f');
  if (shouldRender) render();
}

export function toggleTheme() {
  applyTheme(nextToggledTheme(state.resolvedTheme), true);
  showToast(`${state.resolvedTheme === 'light' ? 'Light' : 'Dark'} theme selected.`);
}
