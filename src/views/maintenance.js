/**
 * The public maintenance screen and the small in-app banners that go with it.
 *
 * Pure "state in, HTML out": the click router in `src/app.js` owns the PIN form, the admin sign-in
 * button and the theme toggle. Visitors who are not admins and do not hold a valid tester PIN never
 * see the rest of the arcade while maintenance is on.
 */

import { MAINTENANCE_REASON_MAX } from '../helpers.js';
import { isSiteLocked, state } from '../state.js';
import { esc, icon, renderBrand } from '../ui/html.js';

function pinCells() {
  return [0, 1, 2, 3].map((index) => {
    const autocomplete = index === 0 ? 'one-time-code' : 'off';
    const enterKey = index === 3 ? 'done' : 'next';
    return `<input id="pin-cell-${index}" class="pin-cell" name="pin${index}" data-pin-index="${index}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="${autocomplete}" enterkeyhint="${enterKey}" aria-label="PIN digits ${index * 4 + 1} to ${index * 4 + 4}" spellcheck="false" autocapitalize="off" autocorrect="off">`;
  }).join('');
}

export function renderMaintenancePage() {
  const pending = Boolean(state.maintenance.pending) && !state.maintenance.enabled;
  const reason = String(state.maintenance.reason || '').trim();
  const themeLabel = state.resolvedTheme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
  const error = state.maintenancePinError
    ? `<p class="form-error" role="alert">${esc(state.maintenancePinError)}</p>`
    : '';
  const reasonCard = reason
    ? `<aside class="maintenance-reason" aria-label="Why the arcade is closed"><span class="eyebrow">From the operator</span><p>${esc(reason)}</p></aside>`
    : '';
  const body = pending
    ? `<div class="maintenance-pending"><span class="loader" aria-hidden="true"></span><p>Checking whether the arcade is open…</p></div>`
    : `<div class="maintenance-copy">
        <p class="press-start">PLEASE STAND BY</p>
        <h1>This site is under maintenance<span>.</span></h1>
        <p class="maintenance-lead">It will soon be available. The cabinets are dark for a short service window — come back in a little while, or enter a tester PIN if you were given one.</p>
      </div>
      ${reasonCard}
      <form class="maintenance-pin-card" data-form="maintenance-pin" autocomplete="off">
        <div>
          <span class="eyebrow">Tester access</span>
          <h2>Have a 16-digit PIN?</h2>
          <p>Type the PIN from the admin to open the arcade on this phone or computer. It only works for the current maintenance window.</p>
        </div>
        <div class="pin-grid" role="group" aria-label="16-digit tester PIN">${pinCells()}</div>
        ${error}
        <button class="button button-primary button-full" type="submit">Enter the arcade ${icon('arrow')}</button>
      </form>
      <div class="maintenance-admin-row">
        <span>Are you the operator?</span>
        <button class="button button-outline" type="button" data-action="open-auth">Admin sign in</button>
      </div>`;
  return `<div class="maintenance-shell">
    <button class="button button-primary skip-link" data-action="skip-to-content">Skip to PIN</button>
    <header class="maintenance-top">
      <a class="brand-lockup" href="#/home" aria-label="PSD-gaming">${renderBrand()}<span><b>PSD</b><small>GAMING</small></span></a>
      <button class="icon-button theme-toggle" data-action="toggle-theme" aria-label="${themeLabel}" title="${themeLabel}">${icon(state.resolvedTheme === 'light' ? 'moon' : 'sun')}</button>
    </header>
    <main class="maintenance-stage" id="page-content">
      <div class="maintenance-orb" aria-hidden="true"><span class="maintenance-cone">${icon('cone')}</span></div>
      ${body}
    </main>
    <p class="maintenance-foot">PSD-gaming · service window · phones and computers welcome</p>
  </div>`;
}

export function renderMaintenanceBanner() {
  if (!state.maintenance.enabled || isSiteLocked()) return '';
  if (state.isAdmin) {
    return `<div class="maintenance-banner" role="status"><span>${icon('cone')} Maintenance is on — visitors see a closed page.</span><button class="text-button" data-action="open-site-admin">Manage ${icon('arrow')}</button></div>`;
  }
  if (state.maintenanceUnlocked) {
    return `<div class="maintenance-banner is-tester" role="status"><span>${icon('shield')} Tester access is active on this device. The public arcade is closed.</span></div>`;
  }
  return '';
}

/** Admin studio: toggle, reason, and the one-time PIN reveal. */
export function renderAdminMaintenance() {
  const on = Boolean(state.maintenance.enabled);
  const reason = esc(state.maintenance.reason || '');
  const saving = state.maintenanceSaving ? 'disabled' : '';
  const pin = state.maintenancePlainPin;
  const pinBlock = on
    ? (pin
      ? `<div class="maintenance-pin-reveal">
          <span class="eyebrow">Show this once</span>
          <b class="maintenance-pin-code" id="maintenance-pin-code">${esc(pin.replace(/(\d{4})(?=\d)/g, '$1 '))}</b>
          <div class="maintenance-pin-actions">
            <button class="button button-primary" type="button" data-action="copy-maintenance-pin">${icon('copy')} Copy PIN</button>
            <button class="button button-outline" type="button" data-action="regenerate-maintenance-pin" ${saving}>${icon('spark')} New PIN</button>
          </div>
          <small>Share it with any phone or computer that should test the arcade. Regenerating (or turning maintenance off and on) retires this PIN immediately.</small>
        </div>`
      : `<div class="maintenance-pin-reveal is-hidden">
          <span class="eyebrow">Tester PIN is live</span>
          <p>A 16-digit PIN is already active for this window. It is only shown on the device that generated it. Mint a new one to see digits again — the old PIN then stops working everywhere.</p>
          <button class="button button-outline" type="button" data-action="regenerate-maintenance-pin" ${saving}>${icon('spark')} Generate a new PIN</button>
        </div>`)
    : `<div class="maintenance-pin-reveal is-idle">
        <span class="eyebrow">Tester PIN</span>
        <p>Turning maintenance on mints a fresh 16-digit PIN. Visitors without it (and who are not admins) only see the closed page.</p>
      </div>`;
  return `<div class="admin-grid">
    <section class="surface admin-table-panel">
      <div class="panel-heading">
        <div>
          <span class="eyebrow">Public arcade gate</span>
          <h2>Maintenance mode</h2>
        </div>
        <button class="maintenance-switch ${on ? 'is-on' : ''}" type="button" data-action="toggle-maintenance" aria-pressed="${on}" ${saving} aria-label="${on ? 'Turn maintenance off' : 'Turn maintenance on'}">
          <i></i><span>${on ? 'On' : 'Off'}</span>
        </button>
      </div>
      <p class="admin-dim">${on ? 'The public sees a closed page. You can still use every part of the arcade, and anyone with the current tester PIN can too.' : 'The arcade is open. Flip the switch to close it for everyone except admins and PIN holders.'}</p>
      ${pinBlock}
    </section>
    <aside class="surface admin-powers">
      <div class="panel-heading">
        <div>
          <span class="eyebrow">Why it is closed</span>
          <h2>Message on the door</h2>
        </div>
        <span>${icon('cone')}</span>
      </div>
      <form data-form="maintenance-reason">
        <label for="maintenance-reason-input">Reason shown to visitors
          <textarea id="maintenance-reason-input" name="reason" maxlength="${MAINTENANCE_REASON_MAX}" rows="5" placeholder="We are upgrading the cabinets. Back shortly.">${reason}</textarea>
        </label>
        <small>Optional. ${MAINTENANCE_REASON_MAX} characters max. Saved independently of the switch.</small>
        <button class="button button-primary" type="submit" ${saving}>${icon('check')} Save message</button>
      </form>
      <ul class="admin-powers-list">
        <li><b>Admins</b> always get through, even with no PIN.</li>
        <li><b>A new PIN</b> is generated every time you turn this on, and whenever you tap New PIN.</li>
        <li><b>Other devices</b> type the 16 digits on the closed page — phones and computers both work.</li>
        <li>Firestore stores only a salted hash. The digits live on this screen until you leave it.</li>
      </ul>
    </aside>
  </div>`;
}
