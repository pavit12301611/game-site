/**
 * Keyboard and screen-reader support that has to survive a full repaint.
 *
 * `render()` replaces the whole of `#app`, which would normally throw away the focused element, the open
 * dialog's focus and any announcement. These helpers record what matters before the repaint and restore it
 * afterwards. They only touch the DOM (never `state`, never Firebase), and every function is safe to call
 * when there is nothing to do.
 */

const LIVE_ID = 'live-region';
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** @typedef {{ selector: string, index: number, start: number | null, end: number | null }} FocusSnapshot */

const cssEscape = (value) => (globalThis.CSS?.escape ? globalThis.CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&'));

/**
 * Describes the focused element in a way that still matches after the markup is rebuilt: its id, or its tag with
 * every data-* attribute (all buttons that matter carry `data-action` plus a payload), plus its position among
 * elements that match the same selector.
 * @param {Element} root
 * @returns {FocusSnapshot | null}
 */
export function captureFocus(root) {
  const el = document.activeElement;
  if (!root || !el || el === document.body || !root.contains(el)) return null;
  let selector = '';
  if (el.id) selector = `#${cssEscape(el.id)}`;
  else {
    const data = Object.entries(/** @type {HTMLElement} */ (el).dataset || {}).map(([key, value]) => `[data-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}="${cssEscape(value)}"]`);
    if (data.length) selector = `${el.tagName.toLowerCase()}${data.join('')}`;
    else if (el.getAttribute('name')) selector = `${el.tagName.toLowerCase()}[name="${cssEscape(el.getAttribute('name'))}"]`;
  }
  if (!selector) return null;
  const index = [...root.querySelectorAll(selector)].indexOf(el);
  const field = /** @type {HTMLInputElement} */ (el);
  const hasSelection = ['INPUT', 'TEXTAREA'].includes(el.tagName) && typeof field.selectionStart === 'number';
  return { selector, index: Math.max(0, index), start: hasSelection ? field.selectionStart : null, end: hasSelection ? field.selectionEnd : null };
}

/**
 * Puts focus back on the element a snapshot describes, if it still exists. Returns whether it did.
 * @param {Element} root
 * @param {FocusSnapshot | null} snapshot
 */
export function restoreFocus(root, snapshot) {
  if (!root || !snapshot) return false;
  let matches;
  try { matches = root.querySelectorAll(snapshot.selector); } catch { return false; }
  const el = /** @type {HTMLElement | undefined} */ (matches[snapshot.index] || matches[0]);
  if (!el || /** @type {HTMLButtonElement} */ (el).disabled) return false;
  el.focus({ preventScroll: true });
  if (snapshot.start !== null) {
    try { /** @type {HTMLInputElement} */ (el).setSelectionRange(snapshot.start, snapshot.end ?? snapshot.start); } catch { /* inputs like email have no selection */ }
  }
  return document.activeElement === el;
}

/** The persistent polite live region. It lives in <body>, outside #app, so a repaint never recreates it. */
export function liveRegion() {
  let region = document.getElementById(LIVE_ID);
  if (!region) {
    region = document.createElement('div');
    region.id = LIVE_ID;
    region.className = 'sr-only';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    document.body.append(region);
  }
  return region;
}

let lastAnnouncement = '';

/** Says `message` to screen readers (once: the same text twice in a row is not repeated). */
export function announce(message) {
  const text = String(message || '').replace(/\s+/g, ' ').trim();
  if (!text || text === lastAnnouncement) return;
  lastAnnouncement = text;
  liveRegion().textContent = text;
}

/**
 * Reads the visible status after a paint (the toast, the match result, the turn) and announces what changed.
 * @param {Element} root
 */
export function syncLiveRegion(root) {
  if (!root) return;
  liveRegion(); // created on the first paint, so it is already in the page when the first message arrives
  const toast = root.querySelector('.toast');
  const result = root.querySelector('.result-banner b');
  const turn = root.querySelector('.turn-chip');
  if (toast) announce(toast.textContent);
  else if (result) announce(result.textContent);
  else if (turn) announce(turn.textContent);
  else lastAnnouncement = '';
}

let dialogWasOpen = false;
/** @type {FocusSnapshot | null} */
let opener = null;

/**
 * Dialog focus management, called after every paint with the snapshot taken before it:
 * opening moves focus into the dialog (remembering where it came from); closing returns it there.
 * @param {Element} root
 * @param {FocusSnapshot | null} before
 * @param {boolean} [pageChanged] a new page already took focus: closing a dialog must not pull it back
 */
export function manageDialogFocus(root, before, pageChanged = false) {
  const dialog = /** @type {HTMLElement | null} */ (document.querySelector('[role="dialog"]'));
  if (dialog) {
    if (!dialogWasOpen) opener = before;
    dialogWasOpen = true;
    if (!dialog.contains(document.activeElement)) {
      const first = /** @type {HTMLElement | null} */ (dialog.querySelector('[autofocus]') || dialog.querySelector(FOCUSABLE));
      if (dialog.getAttribute('tabindex') === null) dialog.setAttribute('tabindex', '-1');
      (first && first.closest('[role="dialog"]') ? first : dialog).focus({ preventScroll: true });
    }
  } else if (dialogWasOpen) {
    dialogWasOpen = false;
    const target = opener;
    opener = null;
    if (!pageChanged) restoreFocus(root, target);
  }
}

/** Keeps Tab inside the open dialog. Returns true when it handled the event. */
export function trapDialogTab(event) {
  if (event.key !== 'Tab') return false;
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return false;
  const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => !el.closest('[hidden]'));
  if (!items.length) { event.preventDefault(); return true; }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (!dialog.contains(active) || (event.shiftKey && (active === first || active === dialog))) { event.preventDefault(); /** @type {HTMLElement} */ (last).focus(); return true; }
  if (!event.shiftKey && active === last) { event.preventDefault(); /** @type {HTMLElement} */ (first).focus(); return true; }
  return false;
}

/** Moves focus to the new page's heading after navigation, so a screen reader starts at the top of the page. */
export function focusPageStart(root) {
  const target = /** @type {HTMLElement | null} */ (root.querySelector('#page-content h1') || root.querySelector('#page-content'));
  if (!target) return;
  if (target.getAttribute('tabindex') === null) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

/**
 * Arrow-key navigation inside a board. A container marked `data-nav="grid"` (with `data-cols`) moves in two
 * dimensions; `data-nav="row"` moves left/right only. Disabled buttons are skipped. Home/End jump to the ends.
 * Returns true when it moved focus (the caller then calls preventDefault()).
 * @param {KeyboardEvent} event
 */
export function handleBoardArrows(event) {
  const keys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const isEdge = event.key === 'Home' || event.key === 'End';
  if (!isEdge && !Object.hasOwn(keys, event.key)) return false;
  if (event.altKey || event.ctrlKey || event.metaKey) return false;
  const origin = event.target instanceof Element ? event.target.closest('button') : null;
  const group = origin?.closest('[data-nav]');
  if (!origin || !group) return false;
  const items = /** @type {HTMLButtonElement[]} */ ([...group.querySelectorAll('button')]);
  const from = items.indexOf(origin);
  if (from < 0) return false;
  const isGrid = /** @type {HTMLElement} */ (group).dataset.nav === 'grid';
  const cols = isGrid ? Math.max(1, Number(/** @type {HTMLElement} */ (group).dataset.cols) || 1) : items.length;
  const enabled = (/** @type {HTMLButtonElement | undefined} */ button) => Boolean(button) && !button?.disabled;
  /** @type {HTMLButtonElement | null | undefined} */
  let next = null;
  if (isEdge) {
    const pool = items.filter(enabled);
    next = event.key === 'Home' ? pool[0] : pool[pool.length - 1];
  } else {
    const [dx, dy] = keys[event.key];
    if (!isGrid && dy !== 0) return false;
    let col = from % cols;
    let row = Math.floor(from / cols);
    for (;;) {
      col += dx; row += dy;
      if (col < 0 || col >= cols || row < 0) break;
      const candidate = items[row * cols + col];
      if (!candidate) break;
      if (enabled(candidate)) { next = candidate; break; }
    }
  }
  if (!next || next === origin) return Boolean(next === origin);
  next.focus();
  return true;
}
