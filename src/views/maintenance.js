/**
 * The dedicated maintenance page: what every non-admin, non-tester visitor sees while
 * maintenance mode is on. It replaces the whole app shell (no sidebar, no search, no game
 * content) and carries the operator's message plus the 16-digit tester PIN field.
 *
 * Pure rendering only: the PIN submit is a `data-form="maintenance-pin"` form handled in
 * src/app.js, and the message is always escaped before it is drawn.
 */

import { esc } from '../ui/html.js';
import { state } from '../state.js';

/** Shown when the operator enabled maintenance without a custom message. */
export const DEFAULT_MAINTENANCE_MESSAGE = 'The arcade is being tuned. Check back soon - the games will be back in one piece.';

/**
 * @returns {string}
 */
export function renderMaintenance() {
  const message = (typeof state.maintenance?.message === 'string' && state.maintenance.message) || DEFAULT_MAINTENANCE_MESSAGE;
  const error = state.maintenanceError || '';
  return `<div class="app-shell is-maintenance"><main class="maintenance-page" id="page-content"><section class="surface maintenance-card" aria-labelledby="maintenance-title">
    <div class="maintenance-glyph" aria-hidden="true">🛠</div>
    <div class="eyebrow">UNDER MAINTENANCE</div>
    <h1 id="maintenance-title">The arcade is closed<span> for a little while</span>.</h1>
    <p class="maintenance-message">${esc(message)}</p>
    <form class="maintenance-pin-form" data-form="maintenance-pin">
      <label for="maintenance-pin">Tester PIN</label>
      <div class="maintenance-pin-row">
        <input id="maintenance-pin" name="pin" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" pattern="[0-9]{16}" maxlength="16" placeholder="16 digits" aria-describedby="maintenance-pin-hint" ${error ? 'aria-invalid="true"' : ''} />
        <button class="button button-primary" type="submit">Preview the arcade</button>
      </div>
      <p id="maintenance-pin-hint" class="maintenance-hint">A 16-digit PIN from the operator opens the site while work is in progress.</p>
      ${error ? `<p class="maintenance-error" role="alert">${esc(error)}</p>` : ''}
    </form>
  </section></main></div>`;
}
