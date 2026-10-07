/**
 * Maintenance mode: reading the switch, obeying it, and operating it.
 *
 * Two documents matter (see `shared/online/maintenance.js` for the shapes and `firestore.rules` for
 * who may write them):
 *
 *   - `siteStatus/maintenance` — public, realtime. This module listens to it, mirrors it into
 *     `state.maintenance`, and caches the last known value in localStorage so a repeat visit during a
 *     maintenance window paints the notice on the first frame instead of flashing the arcade for a
 *     moment.
 *   - `maintenanceAccess/active` — admin-only, read on demand so the studio can show the code again.
 *
 * A visitor who types the right 16-digit code gets a *device pass*: the salted digest of that code,
 * kept in this browser and re-checked against the public document on every paint path. That is what
 * makes the pass revocable with no extra machinery — rotating the code changes the digest, so every
 * unlocked device is locked again the moment it next reads the status document.
 *
 * The pass lives in the browser, so this gate is honest about what it is: a soft door for players
 * while the site is being worked on, not a security boundary. What rules do protect is the data
 * behind it, and only a verified admin can flip the switch.
 */

import { doc, getDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { db, firebaseReady } from './firebase.js';
import { setupError } from './connection.js';
import { friendlyError } from './errors.js';
import {
  MAINTENANCE_ACCESS_COLLECTION,
  MAINTENANCE_ACCESS_DOCUMENT,
  MAINTENANCE_COOLDOWN_MS,
  MAINTENANCE_MAX_ATTEMPTS,
  MAINTENANCE_PIN_DEFAULT_HOURS,
  MAINTENANCE_PIN_DIGITS,
  MAINTENANCE_STATUS_COLLECTION,
  MAINTENANCE_STATUS_DOCUMENT,
  buildMaintenanceAccessUpdate,
  buildMaintenanceStatusUpdate,
  maintenanceAttemptsLocked,
  maintenancePinDigest,
  maintenancePinIsLive,
  maintenancePinWindowMs,
  normalizeMaintenancePin,
  randomMaintenancePin,
  randomMaintenanceSalt,
  registerMaintenanceAttempt,
  safeMaintenanceReason,
} from '../shared/online/maintenance.js';
import { render } from './render.js';
import { state } from './state.js';
import { showToast } from './ui/toast.js';

/** What this device remembers: its pass, the last status, and how many wrong codes it tried. */
export const MAINTENANCE_PASS_KEY = 'psd-maintenance-pass';
export const MAINTENANCE_CACHE_KEY = 'psd-maintenance-status';
export const MAINTENANCE_ATTEMPTS_KEY = 'psd-maintenance-attempts';

/**
 * `db` is null only when Firebase never started; every read and write below sits behind
 * `firebaseReady` or behind an admin sign-in that cannot exist without it, so the cast states what
 * those guards already guarantee (the same pattern as `src/online/admin.js`).
 */
const store = /** @type {import('firebase/firestore').Firestore} */ (db);

/** @type {null | (() => void)} */
let unsubscribe = null;
let started = false;
/** The in-flight status read, so two triggers (a tab becoming visible and a studio button) share one. */
/** @type {null | Promise<void>} */
let probing = null;

/* ------------------------------------------------------------------ what this device remembers */

/** @param {string} key @returns {Record<string, any> | null} */
function readJson(key) {
  try {
    const raw = globalThis.localStorage?.getItem?.(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** @param {string} key @param {Record<string, any> | null} value */
function writeJson(key, value) {
  try {
    if (value === null) globalThis.localStorage?.removeItem?.(key);
    else globalThis.localStorage?.setItem?.(key, JSON.stringify(value));
  } catch {
    // Storage is optional: a blocked localStorage must not stop the page from painting.
  }
}

/** The pass this device earned, if any, as `{ digest, expiresAtMs }`. */
export function readMaintenancePass() {
  const stored = readJson(MAINTENANCE_PASS_KEY);
  const digest = String(stored?.digest || '');
  const expiresAtMs = Number(stored?.expiresAtMs) || 0;
  if (!digest || !expiresAtMs) return null;
  if (expiresAtMs <= Date.now()) {
    writeJson(MAINTENANCE_PASS_KEY, null);
    return null;
  }
  return { digest, expiresAtMs };
}

/** @param {{ digest: string, expiresAtMs: number }} pass */
export function writeMaintenancePass(pass) {
  writeJson(MAINTENANCE_PASS_KEY, { digest: String(pass.digest), expiresAtMs: Number(pass.expiresAtMs) || 0 });
  writeJson(MAINTENANCE_ATTEMPTS_KEY, null);
  state.maintenance.pass = readMaintenancePass();
  state.maintenance.attempts = { count: 0, lockedUntilMs: 0 };
}

/** Locks this device again. The pass is this browser's only key, so forgetting it is the whole story. */
export function clearMaintenancePass() {
  writeJson(MAINTENANCE_PASS_KEY, null);
  writeJson(MAINTENANCE_ATTEMPTS_KEY, null);
  state.maintenance.pass = null;
  state.maintenance.attempts = { count: 0, lockedUntilMs: 0 };
}

function readMaintenanceAttempts() {
  const stored = readJson(MAINTENANCE_ATTEMPTS_KEY);
  return { count: Number(stored?.count) || 0, lockedUntilMs: Number(stored?.lockedUntilMs) || 0 };
}

/* ------------------------------------------------------------------ the live switch */

/** @param {Record<string, any> | null} data the status document, as Firestore sent it */
function adoptMaintenanceStatus(data) {
  const status = {
    enabled: data?.enabled === true,
    reason: String(data?.reason || ''),
    updatedAtMs: Number(data?.updatedAtMs) || 0,
    updatedByUid: String(data?.updatedByUid || ''),
    pinHash: String(data?.pinHash || ''),
    pinSalt: String(data?.pinSalt || ''),
    pinExpiresAtMs: Number(data?.pinExpiresAtMs) || 0,
    pinSetAtMs: Number(data?.pinSetAtMs) || 0,
  };
  const pass = readMaintenancePass();
  state.maintenance = {
    ...state.maintenance,
    ...status,
    pass,
    status: 'live',
    error: '',
    pinExpired: status.enabled && !maintenancePinIsLive(status),
    preview: status.enabled ? state.maintenance.preview : false,
    draft: state.maintenance.draft ?? { reason: status.reason, hours: MAINTENANCE_PIN_DEFAULT_HOURS },
  };
  // The cache only ever says "closed, and this is what the notice looks like", never "open": an
  // expired or stale pass must not be able to keep a device inside a site the operator re-closed.
  writeJson(MAINTENANCE_CACHE_KEY, status.enabled
    ? {
      enabled: true,
      reason: status.reason,
      updatedAtMs: status.updatedAtMs,
      pinHash: status.pinHash,
      pinSalt: status.pinSalt,
      pinExpiresAtMs: status.pinExpiresAtMs,
    }
    : null);
}

/**
 * Reading the switch: one-shot reads, plus a live listener only while the site is closed.
 *
 * The shape is deliberate:
 *   - the first frame of the app never waits on the network (the invariant
 *     `tests/production-boot.test.js` guards), and neither does any other paint: reads happen after
 *     the paint, and the cache decides what the paint shows;
 *   - a normal visitor of an *open* arcade holds no socket. They re-check on their way back to the
 *     tab, which is the moment the answer is worth having;
 *   - anybody inside a maintenance window - the notice itself, an admin studio, a device let in on a
 *     temporary pass - does hold a live listener, because that is where "it just reopened" or "the
 *     code just rotated" matters, and because the listener is detached again the moment the site is
 *     open so nobody keeps one forever.
 *
 * @returns {Promise<void>} resolves once the answer has been adopted (or refused) and painted
 */
async function probeMaintenanceStatus() {
  if (!firebaseReady) {
    state.maintenance = { ...state.maintenance, status: 'unavailable' };
    return;
  }
  if (probing) return probing;
  probing = (async () => {
    try {
      const snapshot = await getDoc(doc(store, MAINTENANCE_STATUS_COLLECTION, MAINTENANCE_STATUS_DOCUMENT));
      adoptMaintenanceStatus(snapshot.exists() ? snapshot.data() : null);
      state.maintenance.error = '';
    } catch (error) {
      // An unreadable status document must not trap anybody: the cached picture stays, the site is
      // painted, and the problem is visible in the console and in the studio rather than silent.
      console.warn('[PSD-gaming] The maintenance status could not be read:', /** @type {any} */ (error)?.code || error);
      state.maintenance = { ...state.maintenance, status: 'error', error: friendlyError(error) };
    } finally {
      probing = null;
      syncMaintenanceListener();
      render();
    }
  })();
  return probing;
}

/** Attaches or drops the realtime listener, depending on whether the site is currently closed. */
function syncMaintenanceListener() {
  const wanted = firebaseReady && state.maintenance.enabled === true;
  if (wanted && !unsubscribe) {
    unsubscribe = onSnapshot(
      doc(store, MAINTENANCE_STATUS_COLLECTION, MAINTENANCE_STATUS_DOCUMENT),
      (snapshot) => {
        adoptMaintenanceStatus(snapshot.exists() ? snapshot.data() : null);
        syncMaintenanceListener();
        render();
      },
      (error) => {
        console.warn('[PSD-gaming] The maintenance listener was closed:', /** @type {any} */ (error)?.code || error);
        state.maintenance = { ...state.maintenance, status: 'error', error: friendlyError(error) };
        unsubscribe = null;
        render();
      },
    );
    return;
  }
  if (!wanted && unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

/**
 * Starts paying attention to the switch. Called once, from `src/app.js`, after the first paint.
 * Idempotent, and safe when Firebase never started (local practice mode).
 */
export function startMaintenanceWatch() {
  if (started) return;
  started = true;
  if (!firebaseReady) {
    state.maintenance = { ...state.maintenance, status: 'unavailable' };
    return;
  }
  void probeMaintenanceStatus();
  // Coming back to the tab is the moment a player would want to know, so that is when the arcade
  // asks again - no timer runs in the background for a site that is simply open.
  const page = typeof document === 'undefined' ? null : /** @type {Document} */ (document);
  page?.addEventListener?.('visibilitychange', () => {
    if (page.visibilityState === 'visible') void probeMaintenanceStatus();
    else syncMaintenanceListener();
  });
}

/** The studio's "re-read status" button, and any caller that wants the answer right now. */
export async function refreshMaintenance() {
  await probeMaintenanceStatus();
  return state.maintenance;
}

/** Detaches the realtime listener (tests, and anything that must not hold a socket open). */
export function stopMaintenanceWatch() {
  unsubscribe?.();
  unsubscribe = null;
}

/**
 * Restores the cached status into `state` before the first paint. Called by `src/app.js` as it wires
 * itself together: a device that was locked out a minute ago should be painted as locked out, not as
 * the arcade, and the live read then confirms or corrects it a moment later.
 */
export function applyMaintenanceCache() {
  const cached = readJson(MAINTENANCE_CACHE_KEY);
  if (!cached || cached.enabled !== true) return;
  state.maintenance = {
    ...state.maintenance,
    status: 'cached',
    enabled: true,
    reason: String(cached.reason || ''),
    updatedAtMs: Number(cached.updatedAtMs) || 0,
    pinHash: String(cached.pinHash || ''),
    pinSalt: String(cached.pinSalt || ''),
    pinExpiresAtMs: Number(cached.pinExpiresAtMs) || 0,
    pass: readMaintenancePass(),
    attempts: readMaintenanceAttempts(),
  };
}

/** Does this viewer have to look at the notice right now? The one question the paint path asks;
the decision itself lives in `src/state.js` next to the data it reads, so the render path, the router
and this module all ask it the same way. */
export { maintenanceBlocks } from './state.js';

/* ------------------------------------------------------------------ typing the code */

/**
 * Checks a typed code against the salted digest in the public document and, when it matches, gives
 * this device a pass. Wrong tries are counted per device, with a short cooldown, so the box cannot be
 * poked at will even though the real protection is a 10^16-digit code space.
 *
 * @param {unknown} rawPin
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function submitMaintenancePin(rawPin) {
  const maintenance = state.maintenance;
  if (!maintenance.enabled) return { ok: false, message: 'Maintenance mode is not switched on, so nothing is locked.' };
  const remaining = maintenanceAttemptsLocked(maintenance.attempts);
  if (remaining) {
    const minutes = Math.max(1, Math.ceil(remaining / 60000));
    return { ok: false, message: `Too many tries. Wait ${minutes} more minute${minutes === 1 ? '' : 's'} and try again.` };
  }
  const pin = normalizeMaintenancePin(rawPin);
  if (pin.length !== MAINTENANCE_PIN_DIGITS) {
    return { ok: false, message: `The access code is ${MAINTENANCE_PIN_DIGITS} digits — ${pin.length} typed so far.` };
  }
  if (!maintenance.pinHash) {
    return { ok: false, message: 'This maintenance window has no access code yet. The operator can generate one in the admin studio.' };
  }
  if (!maintenancePinIsLive(maintenance)) {
    return { ok: false, message: 'That code has expired. The operator has to generate a new one in the admin studio.' };
  }
  state.maintenance.checking = true;
  render();
  let digest = '';
  try {
    digest = await maintenancePinDigest(maintenance.pinSalt, pin);
  } catch (error) {
    console.warn('[PSD-gaming] The access code could not be hashed:', error);
    state.maintenance.checking = false;
    render();
    return { ok: false, message: 'This browser could not check the code. Reload the page and try again.' };
  }
  state.maintenance.checking = false;
  const expiresAtMs = Number(maintenance.pinExpiresAtMs) || 0;
  if (digest === maintenance.pinHash && expiresAtMs > Date.now()) {
    writeMaintenancePass({ digest, expiresAtMs });
    render();
    return { ok: true, message: 'Code accepted. This device can use the arcade while this window lasts.' };
  }
  const attempts = registerMaintenanceAttempt(readMaintenanceAttempts());
  writeJson(MAINTENANCE_ATTEMPTS_KEY, attempts);
  state.maintenance.attempts = attempts;
  const left = MAINTENANCE_MAX_ATTEMPTS - attempts.count;
  render();
  if (attempts.lockedUntilMs) {
    return { ok: false, message: `That is not the code. Wait ${Math.ceil(MAINTENANCE_COOLDOWN_MS / 60000)} minutes before trying again.` };
  }
  return { ok: false, message: `That is not the code. ${left} more attempt${left === 1 ? '' : 's'} before a short pause.` };
}

/* ------------------------------------------------------------------ the admin studio side */

/**
 * Writes the status document and the admin-only code document in one atomic batch: either both land
 * or neither does, so there is never a locked site with no code, or a code floating on its own.
 * @param {Record<string, any>} status
 * @param {Record<string, any> | null | undefined} access an object writes the code document, `null`
 *   deletes it (the window is over), `undefined` leaves it alone (the code stays valid, as after a
 *   reason edit)
 */
async function commitMaintenance(status, access) {
  if (!firebaseReady) throw setupError();
  if (!state.user) throw new Error('Sign in as an admin before changing maintenance mode.');
  const batch = writeBatch(store);
  batch.set(doc(store, MAINTENANCE_STATUS_COLLECTION, MAINTENANCE_STATUS_DOCUMENT), status);
  const accessRef = doc(store, MAINTENANCE_ACCESS_COLLECTION, MAINTENANCE_ACCESS_DOCUMENT);
  if (access === undefined) { /* untouched */ }
  else if (access) batch.set(accessRef, access);
  else batch.delete(accessRef);
  try {
    await batch.commit();
  } catch (error) {
    console.error('[PSD-gaming] commitMaintenance FAILED:', error?.code, error?.message, { status, access: access ? { ...access, pin: '***' } : access });
    throw error;
  }
}

/**
 * Marks the studio busy while a maintenance write is in flight, and always unmarks it: a button left
 * disabled after a failed write would look like the switch itself had broken.
 * @template T @param {() => Promise<T>} task @returns {Promise<T>}
 */
async function whileSaving(task) {
  state.maintenance.saving = true;
  render();
  try {
    return await task();
  } finally {
    state.maintenance.saving = false;
  }
}

/**
 * Mints a code and the two documents that describe it. Kept together because a code and its digest
 * must be born in one breath: `siteStatus/maintenance` carries only the digest, the admin-only
 * document carries the code, and a mismatch between them would lock out the very people the code is
 * for.
 * @param {number} nowMs @param {unknown} hours @param {string} reason
 */
async function mintMaintenancePin(nowMs, hours, reason) {
  const pin = randomMaintenancePin();
  const salt = randomMaintenanceSalt();
  const digest = await maintenancePinDigest(salt, pin);
  const normalizedHours = Math.round(maintenancePinWindowMs(hours) / 3_600_000);
  const expiresAtMs = nowMs + normalizedHours * 3_600_000;
  const uid = state.user?.uid || '';
  return {
    pin,
    hours: normalizedHours,
    expiresAtMs,
    status: buildMaintenanceStatusUpdate({
      enabled: true,
      reason,
      pinDigest: digest,
      salt,
      pinExpiresAtMs: expiresAtMs,
      pinSetAtMs: nowMs,
      uid,
      nowMs,
    }),
    access: buildMaintenanceAccessUpdate({ pin, pinDigest: digest, salt, expiresAtMs, hours: normalizedHours, uid, nowMs }),
  };
}

/**
 * Closes the site to everyone except admins, with the operator's reason and a brand-new code.
 * @param {{ reason?: unknown, hours?: unknown }} [input]
 * @returns {Promise<string>} the code to hand to whoever is testing
 */
export function enableMaintenance({ reason = '', hours = MAINTENANCE_PIN_DEFAULT_HOURS } = {}) {
  const checked = safeMaintenanceReason(reason);
  if (!checked.ok) return Promise.reject(new Error(checked.error));
  return whileSaving(async () => {
    const mint = await mintMaintenancePin(Date.now(), hours, checked.reason);
    await commitMaintenance(mint.status, mint.access);
    state.maintenance.access = { pin: mint.pin, expiresAtMs: mint.expiresAtMs, hours: mint.hours };
    state.maintenance.error = '';
    state.maintenance.draft = { reason: checked.reason, hours: mint.hours };
    // Whatever code this device used before belongs to a window that no longer exists.
    clearMaintenancePass();
    return mint.pin;
  });
}

/**
 * Updates only the reason. The code is left alone, so nobody loses access over a typo fix.
 * @param {unknown} reason
 */
export function saveMaintenanceReason(reason) {
  const checked = safeMaintenanceReason(reason);
  if (!checked.ok) return Promise.reject(new Error(checked.error));
  if (!state.maintenance.enabled) return Promise.reject(new Error('Maintenance mode is off, so there is nothing to explain yet.'));
  return whileSaving(async () => {
    const nowMs = Date.now();
    await commitMaintenance(buildMaintenanceStatusUpdate({
      enabled: true,
      reason: checked.reason,
      pinDigest: state.maintenance.pinHash,
      salt: state.maintenance.pinSalt,
      pinExpiresAtMs: state.maintenance.pinExpiresAtMs,
      pinSetAtMs: state.maintenance.pinSetAtMs,
      uid: state.user?.uid || '',
      nowMs,
    }), undefined);
    state.maintenance.draft = { ...state.maintenance.draft, reason: checked.reason };
  });
}

/**
 * Opens the site again: the code is destroyed, the notice disappears, and every device that had a
 * pass simply stops needing one.
 */
export function disableMaintenance() {
  // Keep the words, not the window: the next maintenance run starts from what you wrote this time.
  const keepReason = safeMaintenanceReason(state.maintenance.reason).reason;
  const keepHours = state.maintenance.draft?.hours || MAINTENANCE_PIN_DEFAULT_HOURS;
  return whileSaving(async () => {
    await commitMaintenance(buildMaintenanceStatusUpdate({
      enabled: false,
      reason: '',
      pinDigest: '',
      salt: '',
      pinExpiresAtMs: 0,
      pinSetAtMs: 0,
      uid: state.user?.uid || '',
      nowMs: Date.now(),
    }), null);
    state.maintenance.access = null;
    state.maintenance.preview = false;
    state.maintenance.draft = { reason: keepReason, hours: keepHours };
    clearMaintenancePass();
  });
}

/**
 * A new code for the same window. Every device unlocked with the old code is locked out again on its
 * next read, because a device pass is the digest of the code it was handed.
 * @param {{ hours?: unknown, reason?: unknown }} [input]
 * @returns {Promise<string>}
 */
export function rotateMaintenancePin({ hours = MAINTENANCE_PIN_DEFAULT_HOURS, reason = undefined } = {}) {
  if (!state.maintenance.enabled) {
    return Promise.reject(new Error('Turn maintenance on first - a code with no locked site is just a number.'));
  }
  const nextReason = reason === undefined ? state.maintenance.reason : safeMaintenanceReason(reason).reason;
  return whileSaving(async () => {
    const mint = await mintMaintenancePin(Date.now(), hours, nextReason);
    await commitMaintenance(mint.status, mint.access);
    state.maintenance.access = { pin: mint.pin, expiresAtMs: mint.expiresAtMs, hours: mint.hours };
    state.maintenance.draft = { reason: nextReason, hours: mint.hours };
    clearMaintenancePass();
    return mint.pin;
  });
}

/**
 * Re-reads the admin-only document so the studio can show the code again after a reload. Rules deny
 * that read to anyone who is not an admin, which is the only reason this is safe to call blindly.
 */
export async function loadMaintenanceAccess() {
  if (!firebaseReady || !state.isAdmin) return null;
  try {
    const snapshot = await getDoc(doc(store, MAINTENANCE_ACCESS_COLLECTION, MAINTENANCE_ACCESS_DOCUMENT));
    const data = snapshot.exists() ? snapshot.data() : null;
    const live = Boolean(data) && Number(data?.expiresAtMs) > Date.now() && state.maintenance.enabled;
    state.maintenance.access = live
      ? { pin: String(data?.pin || ''), expiresAtMs: Number(data?.expiresAtMs) || 0, hours: Number(data?.hours) || 0 }
      : null;
    state.maintenance.accessError = '';
  } catch (error) {
    state.maintenance.access = null;
    state.maintenance.accessError = friendlyError(error);
  }
  return state.maintenance.access;
}

/** Admins only, and only ever a look: a player is never dropped on the notice by accident. */
export function setMaintenancePreview(on) {
  if (!state.maintenance.enabled) {
    showToast('Maintenance mode is off, so there is nothing to preview.', 'warning');
    return;
  }
  state.maintenance.preview = Boolean(on);
  render();
}
