/**
 * The one function that paints the app.
 *
 * It lives here, on its own, so that every other module (toasts, online rooms, accounts, social,
 * CPU play) can ask for a re-render without importing `src/app.js` - which would make the imports
 * circular, because `app.js` is the module that wires them all together.
 *
 * Rendering is always a full re-paint of `#app` from `state`: there is no other source of truth.
 */

import { renderShell } from './views/shell.js';
import { renderFatal } from './views/fatal.js';

/** The root element the app renders into (`#app` in index.html). */
export const appRoot = document.querySelector('#app');

/**
 * Re-paints the whole app from the current state. Safe to call at any time.
 *
 * If drawing throws, the page is replaced by the recovery screen instead of going blank, and the
 * real error still goes to the console where it can be read.
 */
export function render() {
  if (!appRoot) return;
  try {
    appRoot.innerHTML = renderShell();
  } catch (error) {
    console.error('[PSD-gaming] The page could not be drawn:', error);
    appRoot.innerHTML = renderFatal(error);
  }
}
