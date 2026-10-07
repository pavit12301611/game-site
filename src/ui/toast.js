/**
 * Toast notifications.
 */

import { state } from '../state.js';
import { render } from '../render.js';

let toastTimer = null;

/**
 * Shows a toast message.
 * @param {string} message
 * @param {'info'|'success'|'warning'} [type='info']
 */
export function showToast(message, type = 'info') {
  state.toast = { message, type };
  render();
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = null;
    render();
  }, 4000);
}