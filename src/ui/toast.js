/**
 * The little status message in the bottom corner.
 *
 * A toast is part of `state`, so it survives the next re-render like everything else; the timer
 * only clears it and asks for one more paint.
 */

import { render } from '../render.js';
import { state } from '../state.js';

let toastTimer = 0;

/**
 * Shows `message` for a few seconds. Warnings stay longer, and scale with the text, because they
 * carry Firebase setup instructions that someone has to read.
 *
 * @param {string} message
 * @param {'success' | 'warning'} [kind]
 */
export function setToast(message, kind = 'success') {
  state.toast = { message, kind };
  window.clearTimeout(toastTimer);
  render();
  const visibleFor = kind === 'warning' ? Math.min(10000, Math.max(5200, String(message).length * 55)) : 3400;
  toastTimer = window.setTimeout(() => {
    state.toast = null;
    render();
  }, visibleFor);
}

/**
 * Shows a toast and repaints, so it appears immediately.
 *
 * @param {string} message
 * @param {'success' | 'warning'} [kind]
 */
export function showToast(message, kind = 'success') {
  setToast(message, kind);
}
