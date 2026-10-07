/**
 * The one function that paints the app. Full re-paint of #app from state.
 */

import { renderShell } from './views/shell.js';
import { renderFatal } from './views/fatal.js';
import { maintenanceBlocks, state } from './state.js';
import { applyFx } from './ui/fx.js';
import { trackResult } from './result-popup.js';
import { captureFocus, restoreFocus, syncLiveRegion, manageDialogFocus, focusPageStart } from './a11y.js';
import { applyPageMeta } from './seo.js';

export const appRoot = document.querySelector('#app');

let paintedPage = null;

export function render() {
  if (!appRoot) return;
  const before = captureFocus(appRoot);
  try {
    appRoot.innerHTML = renderShell();
  } catch (error) {
    console.error('[PSD-gaming] The page could not be drawn:', error);
    appRoot.innerHTML = renderFatal(error);
    return;
  }
  const pageChanged = paintedPage !== null && paintedPage !== state.page;
  paintedPage = state.page;
  if (pageChanged) focusPageStart(appRoot);
  else restoreFocus(appRoot, before);
  manageDialogFocus(appRoot, before, pageChanged);
  syncLiveRegion(appRoot);
  applyPageMeta(maintenanceBlocks() ? 'maintenance' : state.page);
  applyFx(appRoot);
  trackResult(render);
}