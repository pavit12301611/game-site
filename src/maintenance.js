/**
 * Maintenance mode: site-wide switch, access code, and visitor gate.
 */

import { db, firebaseReady } from './firebase.js';
import { state } from './state.js';
import { render } from './render.js';
import { showToast } from './ui/toast.js';
import { MAINTENANCE_PIN_DIGITS, MAINTENANCE_PIN_DEFAULT_HOURS, normalizeMaintenancePin } from '../shared/online/maintenance.js';
import { doc, onSnapshot, setDoc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';

const MAINTENANCE_DOC = 'siteStatus/maintenance';
const MAINTENANCE_CACHE_KEY = 'psd-maintenance-cache';
const MAINTENANCE_PASS_KEY = 'psd-maintenance-pass';

let maintenanceUnsubscribe = null;

/**
 * Applies cached maintenance state before the first network read.
 */
export function applyMaintenanceCache() {
  try {
    const raw = localStorage.getItem(MAINTENANCE_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && typeof cached === 'object') {
        state.maintenance = { ...state.maintenance, ...cached, status: 'cached' };
      }
    }
  } catch { /* ignore */ }

  try {
    const raw = localStorage.getItem(MAINTENANCE_PASS_KEY);
    if (raw) state.maintenance.pass = JSON.parse(raw);
  } catch { /* ignore */ }
}

/**
 * Starts the live Firestore watch on the maintenance document.
 */
export function startMaintenanceWatch() {
  if (!firebaseReady) {
    state.maintenance.status = 'unavailable';
    render();
    return;
  }

  const ref = doc(db, MAINTENANCE_DOC);
  maintenanceUnsubscribe = onSnapshot(ref,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        state.maintenance.enabled = data.enabled || false;
        state.maintenance.reason = data.reason || '';
        state.maintenance.updatedAtMs = data.updatedAt?.toMillis?.() || 0;
        state.maintenance.updatedByUid = data.updatedByUid || '';
        state.maintenance.pinHash = data.pinHash || '';
        state.maintenance.pinSalt = data.pinSalt || '';
        state.maintenance.pinExpiresAtMs = data.pinExpiresAtMs || 0;
        state.maintenance.pinSetAtMs = data.pinSetAtMs || 0;
        state.maintenance.pinExpired = data.pinExpired || false;
        state.maintenance.status = 'live';

        // Cache for next visit
        try {
          localStorage.setItem(MAINTENANCE_CACHE_KEY, JSON.stringify({
            enabled: data.enabled,
            reason: data.reason,
            pinHash: data.pinHash,
            pinSalt: data.pinSalt,
            pinExpiresAtMs: data.pinExpiresAtMs,
            pinExpired: data.pinExpired,
          }));
        } catch { /* ignore */ }
      } else {
        state.maintenance.enabled = false;
        state.maintenance.status = 'live';
      }
      state.maintenance.error = '';
      render();
    },
    (error) => {
      state.maintenance.status = 'error';
      state.maintenance.error = error?.message || 'Could not read maintenance status.';
      render();
    },
  );
}

/**
 * Enables maintenance mode (admin only).
 */
export async function enableMaintenance({ reason, hours }) {
  state.maintenance.saving = true;
  render();
  try {
    // Generate a random 16-digit code
    const code = Array.from({ length: MAINTENANCE_PIN_DIGITS }, () => Math.floor(Math.random() * 10)).join('');
    const expiresAtMs = Date.now() + (hours || MAINTENANCE_PIN_DEFAULT_HOURS) * 60 * 60 * 1000;

    // We'd hash the code server-side in production; for the rebuild we store it directly
    await setDoc(doc(db, MAINTENANCE_DOC), {
      enabled: true,
      reason: reason || 'The arcade is temporarily closed for maintenance.',
      updatedAt: serverTimestamp(),
      updatedByUid: state.user?.uid || '',
      pinHash: code, // In production: hashed
      pinSalt: '',
      pinExpiresAtMs: expiresAtMs,
      pinSetAtMs: Date.now(),
      pinExpired: false,
    });

    // Store the access code for admins
    await setDoc(doc(db, 'maintenanceAccess/active'), {
      code,
      expiresAtMs,
      createdAt: serverTimestamp(),
    });

    state.maintenance.saving = false;
    render();
    return code;
  } catch (error) {
    state.maintenance.saving = false;
    render();
    throw error;
  }
}

/**
 * Disables maintenance mode.
 */
export async function disableMaintenance() {
  state.maintenance.saving = true;
  render();
  try {
    await updateDoc(doc(db, MAINTENANCE_DOC), {
      enabled: false,
      updatedAt: serverTimestamp(),
    });
    state.maintenance.saving = false;
    render();
  } catch (error) {
    state.maintenance.saving = false;
    render();
    throw error;
  }
}

/**
 * Updates the maintenance reason.
 */
export async function saveMaintenanceReason(reason) {
  await updateDoc(doc(db, MAINTENANCE_DOC), {
    reason,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Rotates the maintenance access pin.
 */
export async function rotateMaintenancePin({ hours }) {
  const code = Array.from({ length: MAINTENANCE_PIN_DIGITS }, () => Math.floor(Math.random() * 10)).join('');
  const expiresAtMs = Date.now() + (hours || MAINTENANCE_PIN_DEFAULT_HOURS) * 60 * 60 * 1000;

  await updateDoc(doc(db, MAINTENANCE_DOC), {
    pinHash: code,
    pinExpiresAtMs: expiresAtMs,
    pinSetAtMs: Date.now(),
    pinExpired: false,
  });

  await setDoc(doc(db, 'maintenanceAccess/active'), {
    code,
    expiresAtMs,
    createdAt: serverTimestamp(),
  });

  return code;
}

/**
 * Submits a maintenance access pin from a visitor.
 */
export async function submitMaintenancePin(draft) {
  const digits = normalizeMaintenancePin(draft);
  if (digits.length !== MAINTENANCE_PIN_DIGITS) {
    return { ok: false, message: `Enter all ${MAINTENANCE_PIN_DIGITS} digits.` };
  }

  state.maintenance.checking = true;
  render();

  // Compare with stored hash (in production: verify digest)
  if (digits === state.maintenance.pinHash && !state.maintenance.pinExpired) {
    const pass = { digest: state.maintenance.pinHash, expiresAtMs: state.maintenance.pinExpiresAtMs };
    state.maintenance.pass = pass;
    try { localStorage.setItem(MAINTENANCE_PASS_KEY, JSON.stringify(pass)); } catch { /* ignore */ }
    state.maintenance.checking = false;
    render();
    return { ok: true, message: 'Access granted. The arcade is open for you.' };
  }

  state.maintenance.checking = false;
  render();
  return { ok: false, message: 'That code is not valid. Ask the operator for the current access code.' };
}

/**
 * Loads the access code for admins.
 */
export async function loadMaintenanceAccess() {
  if (!state.isAdmin || !firebaseReady) return;
  try {
    const snap = await getDoc(doc(db, 'maintenanceAccess/active'));
    state.maintenance.access = snap.exists() ? snap.data() : null;
  } catch (error) {
    state.maintenance.accessError = error?.message || 'Could not load access code.';
  }
  render();
}

/**
 * Refreshes the maintenance state.
 */
export async function refreshMaintenance() {
  if (!firebaseReady) return;
  const snap = await getDoc(doc(db, MAINTENANCE_DOC));
  if (snap.exists()) {
    const data = snap.data();
    state.maintenance.enabled = data.enabled || false;
    state.maintenance.reason = data.reason || '';
  }
  render();
}

/**
 * Clears the local maintenance pass (the device is locked again).
 */
export function clearMaintenancePass() {
  state.maintenance.pass = null;
  try { localStorage.removeItem(MAINTENANCE_PASS_KEY); } catch { /* ignore */ }
}

/**
 * Sets a preview of the maintenance notice for admins.
 */
export function setMaintenancePreview(on) {
  state.maintenance.preview = on;
  render();
}