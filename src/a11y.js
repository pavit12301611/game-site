/**
 * Accessibility: live region, focus management, dialog trapping, board arrow keys.
 */

const LIVE_REGION_ID = 'psd-live-region';

/** Creates the persistent aria-live region outside #app. */
function ensureLiveRegion() {
  if (document.getElementById(LIVE_REGION_ID)) return;
  const region = document.createElement('div');
  region.id = LIVE_REGION_ID;
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'true');
  region.className = 'sr-only';
  document.body.appendChild(region);
}

/** Announces a message to screen readers. */
export function announce(message) {
  ensureLiveRegion();
  const region = document.getElementById(LIVE_REGION_ID);
  if (region) region.textContent = message;
}

/** Captures focus info before a repaint. */
export function captureFocus(root) {
  const active = document.activeElement;
  if (!active || !root.contains(active)) return null;
  return {
    tag: active.tagName,
    id: active.id || null,
    action: active.dataset?.action || null,
    index: active.dataset?.index || active.dataset?.col || null,
  };
}

/** Restores focus to the same element after a repaint. */
export function restoreFocus(root, before) {
  if (!before) return;
  const selector = before.id ? `#${before.id}`
    : before.action ? `[data-action="${before.action}"]` + (before.index ? `[data-index="${before.index}"], [data-col="${before.index}"]` : '')
    : null;
  if (!selector) return;
  const el = root.querySelector(selector);
  if (el && typeof el.focus === 'function') el.focus();
}

/** Syncs the live region with the latest game state announcements. */
export function syncLiveRegion(root) {
  // Announce turn changes and results
  const turnEl = root.querySelector('[data-announce-turn]');
  const resultEl = root.querySelector('[data-announce-result]');
  if (resultEl) announce(resultEl.textContent || '');
  else if (turnEl) announce(turnEl.textContent || '');
}

/** Manages dialog focus: traps Tab inside an open dialog. */
export function manageDialogFocus(root, before, pageChanged) {
  const dialog = root.querySelector('[role="dialog"]');
  if (dialog) {
    const first = dialog.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (first && typeof first.focus === 'function') first.focus();
  }
}

/** Moves focus to the page heading on navigation. */
export function focusPageStart(root) {
  const heading = root.querySelector('h1, h2, [data-page-heading]');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus();
  }
}

/** Traps Tab inside an open dialog element. */
export function trapDialogTab(event) {
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return false;
  const focusable = [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
  if (!focusable.length) return false;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

/** Arrow key navigation inside grid-like boards. */
export function handleBoardArrows(event) {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return false;
  const nav = document.querySelector('[data-nav]');
  if (!nav) return false;
  const cells = [...nav.querySelectorAll('[data-action][data-index], [data-action][data-col]')];
  if (!cells.length) return false;
  const active = document.activeElement;
  const idx = cells.indexOf(active);
  if (idx === -1) return false;

  const cols = nav.dataset.cols ? Number(nav.dataset.cols) : Math.sqrt(cells.length) | 0;
  let next = idx;
  if (event.key === 'ArrowRight') next = Math.min(idx + 1, cells.length - 1);
  else if (event.key === 'ArrowLeft') next = Math.max(idx - 1, 0);
  else if (event.key === 'ArrowDown') next = Math.min(idx + cols, cells.length - 1);
  else if (event.key === 'ArrowUp') next = Math.max(idx - cols, 0);

  if (next !== idx) {
    (/** @type {HTMLElement} */ (cells[next])).focus();
    return true;
  }
  return false;
}