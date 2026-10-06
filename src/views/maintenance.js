/**
 * The maintenance screen, plus the strips that keep an operator (or a tester with a pass) informed.
 *
 * `src/views/shell.js` paints this instead of the whole app chrome while `maintenanceBlocks()` is
 * true, so this is deliberately a complete page of its own: brand, what is happening, when it will be
 * over, and the one box that can open the door again. Everything it shows about the site comes from
 * `state.maintenance`, which `src/maintenance.js` keeps in step with the public Firestore document,
 * so the page changes by itself the moment the operator flips the switch.
 *
 * Design constraints that shaped the markup:
 *   - it must be usable one-handed on a phone, so the code box is a single field with `inputmode=
 *     numeric` (a real numeric keypad, and iOS will offer a copied code via `one-time-code`) rather
 *     than sixteen separate boxes, which is what makes on-screen keyboards jump around;
 *   - it must stay legible with no CSS at all (a broken build, a text-mode reader), so the copy is
 *     the message and the markup is a plain heading, paragraph, list and form;
 *   - it must never invent a status it does not have: the "what's happening" panel prints the
 *     operator's words when there are any, and an honest placeholder when there are not.
 */

import {
  MAINTENANCE_PIN_DIGITS,
  formatMaintenancePin,
  maintenancePinGroupHint,
  normalizeMaintenancePin,
} from '../../shared/online/maintenance.js';
import { maintenanceBlocks, state } from '../state.js';
import { esc, icon, renderBrand } from '../ui/html.js';

/** "just now" / "12m ago" / "3h ago" / "2d ago" from an age in milliseconds. */
function formatAgo(ms) {
  const minutes = Math.floor((Number(ms) || 0) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** "12h 40m" / "40m" from a duration in milliseconds — how long a pass or a code has left. */
function formatLeft(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 60000));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m`;
}

/** A clock time, so "expires at 21:40" is checkable without arithmetic. */
function formatClock(ms) {
  const time = Number(ms) || 0;
  if (!time) return '';
  const date = new Date(time);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** One digit group of the code, for the admin studio's reveal panel. */
function renderPinGroups(pin) {
  const formatted = formatMaintenancePin(pin, ' ');
  return formatted.split(' ').filter(Boolean);
}

/** What the operator wrote, or a sentence that is true instead of an empty box. */
function renderMaintenanceReason() {
  const reason = String(state.maintenance.reason || '').trim();
  const updated = state.maintenance.updatedAtMs ? formatAgo(Date.now() - state.maintenance.updatedAtMs) : '';
  return `<section class="maintenance-reason" aria-labelledby="maintenance-reason-title">
    <div class="maintenance-reason-head"><span class="eyebrow">What is happening</span>${updated ? `<time>updated ${esc(updated)}</time>` : ''}</div>
    <p id="maintenance-reason-title" class="maintenance-reason-text">${reason ? esc(reason) : 'The operator has not left a note about this window. Try again shortly — the arcade usually comes back within the hour.'}</p>
  </section>`;
}

/** The 16-digit box. Disabled while the digest is being computed, and until the digits are all there. */
function renderPinUnlock() {
  const maintenance = state.maintenance;
  const message = String(maintenance.unlockMessage || '');
  const cooldown = Math.max(0, (Number(maintenance.attempts?.lockedUntilMs) || 0) - Date.now());
  const canTry = Boolean(maintenance.pinHash) && !maintenance.pinExpired && !cooldown;
  const typed = normalizeMaintenancePin(maintenance.pinDraft || '');
  const status = maintenance.checking ? 'Checking the code…' : `${typed.length} of ${MAINTENANCE_PIN_DIGITS} digits typed`;
  return `<section class="maintenance-unlock" aria-labelledby="maintenance-unlock-title">
    <div class="maintenance-unlock-head"><h2 id="maintenance-unlock-title">Testing it while it is closed?</h2><span class="maintenance-pin-chip"><i></i> ${esc(maintenancePinGroupHint())}</span></div>
    <p>${canTry ? 'The operator can hand out a temporary code that opens the arcade on this device — phone or laptop. Type or paste it below.' : maintenance.pinExpired ? 'The code for this window has expired. Ask the operator to generate a new one in the admin studio.' : cooldown ? `Too many tries. You can type again in ${esc(formatLeft(cooldown))}.` : 'There is no access code for this window yet. Only the operator can generate one.'}</p>
    <form class="maintenance-pin-form" data-form="maintenance-pin" novalidate>
      <label for="maintenance-pin-input">Temporary access code<small id="maintenance-pin-tally">${esc(status)}</small></label>
      <div class="maintenance-pin-row">
        <input id="maintenance-pin-input" name="pin" type="text" value="${esc(formatMaintenancePin(typed))}"
          inputmode="numeric" autocomplete="one-time-code" autocorrect="off" autocapitalize="none" spellcheck="false"
          maxlength="${MAINTENANCE_PIN_DIGITS + 3}" placeholder="0000 0000 0000 0000" aria-describedby="maintenance-pin-help"
          aria-invalid="${message && !maintenance.unlockOk ? 'true' : 'false'}" data-maintenance-pin ${canTry ? '' : 'disabled'}>
        <button class="button button-primary" type="submit" data-maintenance-submit ${canTry && typed.length === MAINTENANCE_PIN_DIGITS && !maintenance.checking ? '' : 'disabled'}>${maintenance.checking ? 'Checking' : 'Unlock'} ${icon(maintenance.checking ? 'spark' : 'arrow')}</button>
      </div>
      <p id="maintenance-pin-help" class="maintenance-pin-help ${message ? `is-${maintenance.unlockOk ? 'ok' : 'error'}` : ''}" role="status">
        ${message ? esc(message) : `${MAINTENANCE_PIN_DIGITS} digits, spaces optional. This device remembers it until the code expires or is rotated.`}
      </p>
    </form>
    ${canTry ? `<button class="text-button maintenance-pin-paste" data-action="maintenance-paste">${icon('copy')} Try to paste from this device</button>` : ''}
  </section>`;
}

/**
 * The strip only a verified viewer sees: an admin who is walking past their own closed door, or a
 * device that opened it with a code. It says so plainly, because "is maintenance on?" should never
 * depend on remembering which tab you are in.
 */
export function renderMaintenanceBanner() {
  const maintenance = state.maintenance;
  if (!maintenance.enabled || maintenanceBlocks()) return '';
  const updated = maintenance.updatedAtMs ? `Switched on ${formatAgo(Date.now() - maintenance.updatedAtMs)}.` : '';
  if (state.isAdmin) {
    return `<div class="maintenance-banner" role="status"><span class="maintenance-banner-glyph">${icon('settings')}</span>
      <div><b>Maintenance mode is on.</b><p>Visitors see the notice; you are seeing the arcade because this account is an admin. ${esc(updated)}</p></div>
      <button class="button button-outline button-small" data-action="maintenance-preview-on">${icon('search')} Visitor view</button>
      <button class="button button-primary button-small" data-action="maintenance-open-studio">${icon('shield')} Controls</button>
      <button class="button button-quiet button-small" data-action="maintenance-off">Turn off</button></div>`;
  }
  const pass = maintenance.pass;
  if (!pass) return '';
  const left = Math.min(Number(pass.expiresAtMs) || 0, Number(maintenance.pinExpiresAtMs) || 0) - Date.now();
  return `<div class="maintenance-banner is-pass" role="status"><span class="maintenance-banner-glyph">${icon('check')}</span>
    <div><b>You are in with a temporary code.</b><p>The arcade is closed to everyone else${left > 0 ? `; this device stays open for ${esc(formatLeft(left))} (until ${esc(formatClock(Math.min(Number(pass.expiresAtMs) || 0, Number(maintenance.pinExpiresAtMs) || 0)))})` : ''}. ${esc(updated)}</p></div>
    <button class="button button-outline button-small" data-action="maintenance-end-pass">End access</button></div>`;
}

/**
 * The page a visitor gets while the site is closed. It is rendered in place of the whole app shell,
 * so it owns the document: heading, the operator's reason, the code box, and an admin escape hatch.
 */
export function renderMaintenanceScreen() {
  const maintenance = state.maintenance;
  const pinLeft = Math.max(0, (Number(maintenance.pinExpiresAtMs) || 0) - Date.now());
  const statusNote = maintenance.status === 'error'
    ? `<span class="maintenance-flag is-warn">${icon('wifi')} Could not reach the arcade to double-check. Showing the last known status.</span>`
    : maintenance.status === 'unavailable'
      ? `<span class="maintenance-flag">${icon('spark')} Not connected to Firebase, so this notice is only as fresh as this device's last visit.</span>`
      : maintenance.status === 'pending'
        ? `<span class="maintenance-flag"><i class="maintenance-spinner" aria-hidden="true"></i> Confirming the arcade is still closed…</span>`
        : maintenance.status === 'cached' && maintenance.updatedAtMs
          // The page a visitor sees before anything has been read says so, rather than claiming a
          // connection it does not have yet. `src/maintenance.js` promotes it to live on its own.
          ? `<span class="maintenance-flag"><i class="maintenance-dot"></i> From this device's last visit · updated ${esc(formatAgo(Date.now() - maintenance.updatedAtMs))}</span>`
          : maintenance.status === 'live' && maintenance.updatedAtMs
            ? `<span class="maintenance-flag"><i class="live-dot"></i> Live status · updated ${esc(formatAgo(Date.now() - maintenance.updatedAtMs))}</span>`
            : '';
  return `<main class="maintenance-screen" id="page-content">
    <div class="maintenance-inner">
      <header class="maintenance-brand"><span class="maintenance-brand-lockup">${renderBrand()}<span><b>PSD</b><small>GAMING</small></span></span>${statusNote}</header>
      <div class="maintenance-ticker" aria-hidden="true"><span>${'OUT OF ORDER · WE WILL BE BACK · OUT OF ORDER · WE WILL BE BACK · NO SAVE WAS LOST · '.repeat(3)}</span></div>
      <section class="surface maintenance-card" aria-labelledby="maintenance-title">
        <span class="maintenance-glyph" aria-hidden="true">${icon('settings')}</span>
        <p class="eyebrow">The arcade is closed for a moment</p>
        <h1 id="maintenance-title">This site is under maintenance<span>.</span></h1>
        <p class="maintenance-lead">It will be available again soon. Nothing is lost: your favorites, your recent games and your username all stay on this device, and your rooms expire on their own.</p>
        ${renderMaintenanceReason()}
        ${maintenance.pinHash ? `<div class="maintenance-code-meta"><span><b>${maintenance.pinExpired ? 'Access code expired' : `Access code valid for ${esc(formatLeft(pinLeft))}`}</b>${maintenance.pinExpiresAtMs && !maintenance.pinExpired ? `<small>Codes stop working at ${esc(formatClock(maintenance.pinExpiresAtMs))}.</small>` : ''}</span></div>` : ''}
        ${renderPinUnlock()}
        <div class="maintenance-admin">
          ${state.isAdmin
    ? `<p>${state.maintenance.preview ? 'This is the notice your visitors are seeing. Everything is still open to you — press “Back to the arcade”.' : 'Admin accounts are never locked out, which is why you can read this page and keep working.'}</p><button class="button button-primary button-small" data-action="maintenance-preview-off">Back to the arcade</button><button class="button button-outline button-small" data-action="maintenance-open-studio">Admin studio ${icon('arrow')}</button>`
    : state.user
      ? `<p>Signed in as <b>${esc(state.profile?.username || state.user.email || 'this account')}</b>, which is not an admin account. ${maintenance.pass ? 'This device does have a code that works.' : 'A code below opens this device.'}</p><button class="button button-outline button-small" data-action="open-auth">Switch account</button>`
      : `<p>Running this arcade? Sign in with the admin account to keep working while the notice is up.</p><button class="button button-outline button-small" data-action="open-auth">Admin sign-in ${icon('arrow')}</button>`}
        </div>
      </section>
      <footer class="maintenance-foot"><span>${esc(maintenancePinGroupHint())} · this page updates by itself the moment the work is done</span></footer>
    </div>
  </main>`;
}

/** The code, shown to the one person allowed to see it. */
export function renderMaintenanceCodePin(pin) {
  const groups = renderPinGroups(pin);
  if (!groups.length) return '<span class="maintenance-pin-empty">No code for this window</span>';
  return `<span class="maintenance-pin-display" aria-label="Access code ${esc(groups.join(' '))}">${groups.map((group) => `<b>${esc(group)}</b>`).join('')}</span>`;
}
