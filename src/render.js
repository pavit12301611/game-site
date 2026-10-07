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
import { renderMaintenancePage } from './views/maintenance.js';
import { maintenanceIsActive } from '../shared/online/maintenance.js';
import { state } from './state.js';
import { applyFx } from './ui/fx.js';
import { trackResult } from './result-popup.js';
import { captureFocus, restoreFocus, syncLiveRegion, manageDialogFocus, focusPageStart } from './a11y.js';
import { applyPageMeta } from './seo.js';

/** The root element the app renders into (`#app` in index.html). */
export const appRoot = document.querySelector('#app');

/**
 * Re-paints the whole app from the current state. Safe to call at any time.
 *
 * If drawing throws, the page is replaced by the recovery screen instead of going blank, and the
 * real error still goes to the console where it can be read.
 */
let paintedPage = null;

export function render() {
  if (!appRoot) return;
  const before = captureFocus(appRoot);
  // Maintenance mode replaces the whole screen - no sidebar, topbar or mobile nav - for every
  // visitor except a verified admin (who needs the studio to switch it back off) and a tester who
  // redeemed the current PIN. Everything else about the app is untouched.
  const maintenance = maintenanceIsActive(state.maintenance, {
    isAdmin: state.isAdmin,
    unlocked: state.maintenanceUnlocked,
  });
  try {
    appRoot.innerHTML = maintenance ? renderMaintenancePage() : renderShell();
  } catch (error) {
    console.error('[PSD-gaming] The page could not be drawn:', error);
    appRoot.innerHTML = renderFatal(error);
    return;
  }
  // A repaint must not cost the keyboard user their place: a new page starts at its heading, anything else
  // gets focus back on the same control. An open dialog takes focus (and gives it back when it closes).
  const pageChanged = paintedPage !== null && paintedPage !== state.page;
  paintedPage = state.page;
  if (pageChanged) focusPageStart(appRoot);
  else restoreFocus(appRoot, before);
  manageDialogFocus(appRoot, before, pageChanged);
  syncLiveRegion(appRoot);
  applyPageMeta();
  applyFx(appRoot);
  trackResult(render);
}
