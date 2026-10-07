/**
 * Maintenance mode, from the browser side.
 *
 * The rules of the road (see firestore.rules and functions/src/handlers.js):
 *
 *   - `maintenance/status` is the only maintenance document a client may read: the safe fields
 *     (enabled, message). The 16-digit tester PIN lives in `maintenance/secrets/status`, which
 *     every client - admin included - is denied.
 *   - Turning maintenance on/off and rotating the PIN is the `adminSetMaintenance` callable
 *     (admin-verified on the server); the PIN is compared in `verifyMaintenancePin` and a
 *     verified tester's pass is re-checked by `checkMaintenanceBypass`. The browser never
 *     writes any maintenance document.
 *   - A missing or malformed flag fails OPEN: the arcade keeps working and the problem goes to
 *     the console, because a maintenance read must never be what takes the site down.
 */

import { doc, getDoc } from 'firebase/firestore';
import { callBackend } from './online/callables.js';
import { db, firebaseReady } from './firebase.js';
import { render } from './render.js';
import { state } from './state.js';

/** Where a verified tester's bypass token lives on this device. */
export const MAINTENANCE_BYPASS_KEY = 'psd-gaming.maintenance-bypass';
/** The last known flag, so a returning visitor is gated before any network round trip. */
export const MAINTENANCE_STATUS_KEY = 'psd-gaming.maintenance-status';
/** Same ceiling the backend enforces, so the admin field and the server cannot disagree. */
export const MAINTENANCE_MESSAGE_MAX = 280;
/**
 * The first paint must never need the network (see tests/production-boot.test.js), so the server
 * re-check of the flag waits for the shell to be up and a slow connection to have a head start.
 */
export const MAINTENANCE_CHECK_DELAY_MS = 1200;

/** `db` is null only when Firebase never started; every export below is guarded by `firebaseReady`. */
const store = /** @type {import('firebase/firestore').Firestore} */ (db);

/**
 * Makes whatever the status document holds (or does not) safe to render: only a real boolean
 * `true` enables the page, only a real string may be shown (and it is capped at the backend's
 * ceiling), and anything else degrades to "open".
 * @param {unknown} data
 * @returns {{ enabled: boolean, message: string }}
 */
export function normalizeMaintenanceData(data) {
  if (!data || typeof data !== 'object') return { enabled: false, message: '' };
  const enabled = /** @type {Record<string, any>} */ (data).enabled === true;
  const message = /** @type {Record<string, any>} */ (data).message;
  return { enabled, message: typeof message === 'string' ? message.slice(0, MAINTENANCE_MESSAGE_MAX) : '' };
}

/**
 * Reads and normalizes the public maintenance flag. Missing document, wrong shapes and read
 * failures all resolve to something renderable - never a rejection that could stop the boot.
 * @returns {Promise<{ enabled: boolean, message: string } | null>} null = not read (Firebase off)
 */
export function loadMaintenanceStatus() {
  return (async () => {
    if (!firebaseReady || !db) return null;
    try {
      const snapshot = await getDoc(doc(store, 'maintenance/status'));
      return normalizeMaintenanceData(snapshot.exists() ? snapshot.data() : null);
    } catch (error) {
      console.warn('[PSD-gaming] The maintenance flag could not be read; the arcade stays open.', error);
      return null;
    }
  })();
}

/** The last good flag from this device, or null (a broken cache must not gate the arcade). @returns {{ enabled: boolean, message: string } | null} */
export function readCachedMaintenanceStatus() {
  try {
    const raw = localStorage.getItem(MAINTENANCE_STATUS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const normalized = normalizeMaintenanceData(parsed);
    return normalized.enabled || normalized.message ? normalized : null;
  } catch { return null; }
}

/** @param {{ enabled: boolean, message: string } | null} status */
function writeCachedMaintenanceStatus(status) {
  if (!status) return;
  try { localStorage.setItem(MAINTENANCE_STATUS_KEY, JSON.stringify(status)); } catch { /* the cache is best effort */ }
}

/**
 * Start-up hook. The order of operations is deliberate:
 *
 *   1. A cached "enabled" is applied at once - a visitor who came back mid-maintenance lands on
 *      the maintenance page with no network at all.
 *   2. The shell is painted (boot draws it right after this returns).
 *   3. Only then is the flag re-checked with the server - a signed-out first visit must not
 *      fetch anything before its first paint - and the result (or the last known one, when the
 *      read fails) is shown. When maintenance is on for this visitor, a stored bypass token is
 *      re-verified with the backend before it is trusted.
 *
 * Never rejects; a flag that cannot be read leaves the arcade open.
 */
export async function initializeMaintenance() {
  if (!firebaseReady) return;
  const cached = readCachedMaintenanceStatus();
  if (cached?.enabled && !state.isAdmin) {
    state.maintenance = cached;
    render();
  }
  await new Promise((resolve) => setTimeout(resolve, MAINTENANCE_CHECK_DELAY_MS));
  const fresh = await loadMaintenanceStatus();
  if (fresh) {
    state.maintenance = fresh;
    writeCachedMaintenanceStatus(fresh);
    render();
    if (fresh.enabled && !state.isAdmin) await resumeMaintenanceBypass();
  } else if (state.maintenance?.enabled) {
    // The read failed while a cached window is showing: keep showing it (the last known state)
    // rather than opening a closed arcade. The bypass token is still re-verified next load.
    render();
  }
}

/** Reads the stored bypass token, tolerating a blocked localStorage. @returns {string} */
export function storedBypassToken() {
  try { return localStorage.getItem(MAINTENANCE_BYPASS_KEY) || ''; } catch { return ''; }
}

/** @param {string} token */
function storeBypassToken(token) {
  try { localStorage.setItem(MAINTENANCE_BYPASS_KEY, token); } catch { /* the pass still works for this paint */ }
}

/** Clears a dead pass. */
export function clearBypassToken() {
  try { localStorage.removeItem(MAINTENANCE_BYPASS_KEY); } catch { /* nothing to clear */ }
}

/**
 * A stored pass is only worth its bytes when the backend still says it is: ask
 * `checkMaintenanceBypass`, and when the answer is no (or unreachable), open nothing.
 */
export async function resumeMaintenanceBypass() {
  const token = storedBypassToken();
  if (!token) return;
  try {
    const result = await callBackend('checkMaintenanceBypass', { token });
    if (!result?.valid) { clearBypassToken(); return; }
    state.maintenanceBypass = true;
    render();
  } catch {
    // Backend not reachable: the safe default is to stay on the maintenance page, not to guess.
    clearBypassToken();
  }
}

/**
 * The maintenance page's PIN form. A correct PIN is exchanged server-side for a bypass token
 * (stored on this device); a wrong one stays on the page with a plain sentence.
 * @param {string} pin
 * @returns {Promise<boolean>} whether the arcade is now open for this visitor
 */
export async function verifyMaintenancePin(pin) {
  const result = await callBackend('verifyMaintenancePin', { pin });
  if (result?.valid && typeof result.token === 'string') {
    storeBypassToken(result.token);
    state.maintenanceBypass = true;
    state.maintenanceError = '';
    render();
    return true;
  }
  state.maintenanceError = 'That PIN does not match. Ask the operator for the current 16-digit tester PIN.';
  render();
  return false;
}
