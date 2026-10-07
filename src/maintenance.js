/**
 * Maintenance mode on the client side.
 *
 * The public half of the feature: read `maintenance/status` (readable without signing in), remember
 * what it said, and let someone who was handed the tester PIN step through the closed door.
 *
 * Two deliberate limits, both inherited from this app's design:
 *
 *   - **The first paint never waits on the network.** The shell is drawn from local state and this
 *     module reads the maintenance document at the first idle moment after it (`loadMaintenanceStatus`
 *     explains why it is deferred), so a visitor who arrives while the arcade is closed sees the app
 *     for a moment and then the notice. It re-reads whenever the tab is focused again, which is far
 *     cheaper than a listener that stays open for every visitor.
 *   - **The PIN is never verified here.** The digits go to the `redeemMaintenancePin` callable, which
 *     compares them against a salted hash in a collection no browser can read, behind a rate limit,
 *     and answers with the PIN generation they belong to. The pass a tester then holds lives in
 *     `sessionStorage` for that tab and only saves them from typing 16 digits again: the maintenance
 *     page is a notice, not a security boundary - everything behind it is still protected by the
 *     Firestore rules and the callable checks exactly as before.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db, firebaseReady } from './firebase.js';
import { friendlyError } from './errors.js';
import { render } from './render.js';
import { state } from './state.js';
import { callBackend } from './online/callables.js';
import {
  MAINTENANCE_PIN_LENGTH,
  MAINTENANCE_STATUS_COLLECTION,
  MAINTENANCE_STATUS_DOC_ID,
  isValidMaintenancePin,
  maintenancePassMatches,
  normalizeMaintenancePin,
  safeMaintenanceStatus,
} from '../shared/online/maintenance.js';

/**
 * `db` is null only when Firebase never started, and every read below is behind `firebaseReady`, so
 * this cast states a guarantee the guards already make (the same pattern as src/online/admin.js).
 */
const store = /** @type {import('firebase/firestore').Firestore} */ (db);

/** The tester pass for this tab: `{ token, pinVersion }`, never the PIN itself. */
const PASS_STORAGE_KEY = 'psd-gaming-maintenance-pass';

/** Set once the focus re-reads are wired, so a second call does not add a second set of listeners. */
let watching = false;
/** The last status that was painted, so an unchanged read does not repaint the page. */
let painted = '';

/** @returns {{ token: string, pinVersion: number } | null} */
function readStoredPass() {
  try {
    const raw = sessionStorage.getItem(PASS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const token = typeof parsed?.token === 'string' ? parsed.token : '';
    return token ? { token, pinVersion: Math.floor(Number(parsed.pinVersion) || 0) } : null;
  } catch {
    // Storage can be blocked, or hold something that is not JSON: no pass, no crash.
    return null;
  }
}

/** @param {{ token: string, pinVersion: number } | null} pass */
function writeStoredPass(pass) {
  try {
    if (pass) sessionStorage.setItem(PASS_STORAGE_KEY, JSON.stringify(pass));
    else sessionStorage.removeItem(PASS_STORAGE_KEY);
  } catch {
    // A blocked sessionStorage costs the tester a re-typed PIN, nothing more.
  }
}

/** The pass this tab holds, in memory, so `state` and storage cannot drift. */
state.maintenancePass = readStoredPass();

/** Recomputes "may this visitor see the arcade?" from the live status and the stored pass. */
function syncUnlocked() {
  state.maintenanceUnlocked = maintenancePassMatches(state.maintenancePass, state.maintenance);
}

/**
 * Applies one read of the public document (or a missing/malformed one) and repaints when anything
 * actually changed. Never throws: `safeMaintenanceStatus` turns every surprise into "not in
 * maintenance", because a broken document must not be able to close the arcade.
 * @param {unknown} raw
 */
export function applyMaintenanceStatus(raw) {
  const next = safeMaintenanceStatus(raw);
  state.maintenance = next;
  syncUnlocked();
  const signature = JSON.stringify(next);
  if (signature === painted) return;
  painted = signature;
  render();
}

/**
 * Reads `maintenance/status` right now, and wires the "tab focused again" re-reads (once). Safe to
 * call before sign-in, safe to call when Firebase never started - a deployment without Firebase
 * cannot be in maintenance mode - and safe to call twice.
 * @returns {Promise<void>}
 */
export async function readMaintenanceStatus() {
  if (!firebaseReady || !store) {
    applyMaintenanceStatus(null);
    return;
  }
  try {
    const snapshot = await getDoc(doc(store, MAINTENANCE_STATUS_COLLECTION, MAINTENANCE_STATUS_DOC_ID));
    applyMaintenanceStatus(snapshot.exists() ? snapshot.data() : null);
  } catch (error) {
    // An unreadable status is not an outage of its own: show the arcade, keep the last known notice,
    // and try again the next time the tab is focused.
    console.warn('[PSD-gaming] The maintenance status could not be read:', /** @type {any} */ (error)?.message);
  }
  if (watching) return;
  watching = true;
  // Coming back to a long-open tab is the moment a stale notice matters most, and one read is much
  // cheaper than a listener that stays open for every visitor.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void readMaintenanceStatus();
  });
  window.addEventListener('focus', () => { void readMaintenanceStatus(); });
}

/** Set once the first read has been scheduled, so start-up can call this as often as it likes. */
let scheduled = false;

/**
 * Start-up entry point: reads the notice at the first idle moment after the shell has been painted,
 * then leaves the re-reads of `readMaintenanceStatus` in place.
 *
 * Deferred on purpose. The maintenance page is a notice, not a gate on the app's own code, and this
 * codebase's one hard promise is that the first paint never waits on - or competes with - the
 * network: an eager read would put a Firestore request (and, on a flaky connection, a Firestore
 * error log) inside the boot path of every single visitor, maintenance or not.
 */
export function loadMaintenanceStatus() {
  if (scheduled) return;
  scheduled = true;
  const run = () => { void readMaintenanceStatus(); };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 2000 });
  else window.setTimeout(run, 800);
}

/**
 * Redeems a typed tester PIN. The shape is checked here only so an obvious typo does not spend one
 * of the rate-limited attempts; the comparison itself happens on the server.
 * @param {string} typed
 * @returns {Promise<{ unlocked: true, pinVersion: number }>}
 */
export async function unlockMaintenanceWithPin(typed) {
  const pin = normalizeMaintenancePin(typed);
  state.maintenanceError = '';
  if (!isValidMaintenancePin(pin)) {
    state.maintenanceError = `The tester PIN is exactly ${MAINTENANCE_PIN_LENGTH} digits. Check it and try again.`;
    render();
    throw new Error(state.maintenanceError);
  }
  try {
    const result = await callBackend('redeemMaintenancePin', { pin });
    state.maintenancePass = { token: String(result?.token || ''), pinVersion: Math.floor(Number(result?.pinVersion) || 0) };
    writeStoredPass(state.maintenancePass);
    state.maintenanceError = '';
    syncUnlocked();
    render();
    return /** @type {any} */ (result);
  } catch (error) {
    state.maintenanceError = friendlyError(error);
    render();
    throw error;
  }
}

/** The pass this tab holds (used by the tests and by an admin's own display). */
export function currentMaintenancePass() {
  return state.maintenancePass;
}
