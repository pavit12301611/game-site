/**
 * The maintenance page: the whole screen a visitor sees while the arcade is closed.
 *
 * Pure rendering, like every other view - it reads `state.maintenance` and returns HTML. The PIN
 * field posts through the `maintenance-pin` form handler in src/app.js, which hands the digits to
 * the trusted backend (`redeemMaintenancePin`); nothing here compares them.
 */

import { MAINTENANCE_PIN_LENGTH } from '../../shared/online/maintenance.js';
import { state } from '../state.js';
import { esc, icon, renderBrand } from '../ui/html.js';

/** The PIN input's pattern: digits only, exactly the configured length. */
const PIN_PATTERN = `[0-9]{${MAINTENANCE_PIN_LENGTH}}`;

export function renderMaintenancePage() {
  const status = state.maintenance;
  const error = state.maintenanceError
    ? `<p class="maintenance-error" role="alert">${esc(state.maintenanceError)}</p>`
    : '';
  return `<div class="maintenance-screen">
    <section class="maintenance-card" aria-labelledby="maintenance-title">
      <p class="maintenance-brand">${renderBrand()}<b>PSD<span>-GAMING</span></b></p>
      <span class="eyebrow">Back in a moment</span>
      <h1 id="maintenance-title">The arcade is closed for maintenance<span>.</span></h1>
      <p class="maintenance-message">${esc(status.message)}</p>
      <form class="maintenance-pin-form" data-form="maintenance-pin" novalidate>
        <label for="maintenance-pin">Tester PIN</label>
        <div class="maintenance-pin-row">
          <input id="maintenance-pin" name="pin" type="text" inputmode="numeric" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="${MAINTENANCE_PIN_LENGTH}" pattern="${PIN_PATTERN}" aria-describedby="maintenance-pin-hint" placeholder="${'0'.repeat(MAINTENANCE_PIN_LENGTH)}" required>
          <button class="button button-primary" type="submit">Unlock ${icon('arrow')}</button>
        </div>
        <small id="maintenance-pin-hint">Invited tester? Type the ${MAINTENANCE_PIN_LENGTH}-digit PIN the operator sent you and the arcade opens for this tab. Everyone else: nothing to do - the page returns to normal by itself.</small>
      </form>
      ${error}
      <ul class="maintenance-points">
        <li>${icon('shield')} Nothing is lost: accounts, reviews and rooms are stored server-side.</li>
        <li>${icon('gamepad')} Practice games come back with the arcade.</li>
      </ul>
    </section>
    <p class="maintenance-footnote">PSD-gaming · maintenance mode is controlled by a verified administrator.</p>
  </div>`;
}
