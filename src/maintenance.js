/**
 * Site-wide maintenance mode.
 *
 * An admin toggles it from the studio. While it is on, visitors see a closed page; the admin still
 * uses the arcade as usual. A fresh 16-digit tester PIN is minted every time maintenance is turned
 * on (and whenever an admin regenerates it) so another phone or computer can open the site for
 * testing. The PIN itself is never stored: Firestore keeps a salted SHA-256 hash, the plaintext is
 * shown once to the admin who generated it, and a matching device keeps a session token in
 * localStorage that dies the moment the PIN or the maintenance window changes.
 *
 * The public `site/status` document is world-readable so a visitor can learn the arcade is closed
 * without signing in. Writes still go through `isAdmin()` in firestore.rules.
 */

import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db, firebaseReady } from './firebase.js';
import {
  MAINTENANCE_PASS_STORAGE_KEY,
  MAINTENANCE_PIN_LENGTH,
  MAINTENANCE_REASON_MAX,
} from './helpers.js';
import { render } from './render.js';
import { state } from './state.js';
import { showToast } from './ui/toast.js';

/** @type {import('firebase/firestore').Firestore} */
const store = /** @type {import('firebase/firestore').Firestore} */ (db);

const PIN_HASH_HEX_LENGTH = 64;

/** @param {number} byteCount */
function randomHex(byteCount = 16) {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

/**
 * Cryptographically random 16 decimal digits. Values 250–255 are rejected so `% 10` is unbiased.
 * @param {(n: number) => Uint8Array} [randomBytes]
 * @returns {string}
 */
export function generateMaintenancePin(randomBytes = (count) => {
  const bytes = new Uint8Array(count);
  crypto.getRandomValues(bytes);
  return bytes;
}) {
  let pin = '';
  while (pin.length < MAINTENANCE_PIN_LENGTH) {
    const bytes = randomBytes(32);
    for (const value of bytes) {
      if (value > 249) continue;
      pin += String(value % 10);
      if (pin.length === MAINTENANCE_PIN_LENGTH) break;
    }
  }
  return pin;
}

/** Strip everything but digits and cap at 16. */
export function normalizeMaintenancePin(value = '') {
  return String(value || '').replace(/\D/g, '').slice(0, MAINTENANCE_PIN_LENGTH);
}

/** Group a 16-digit PIN as `XXXX XXXX XXXX XXXX` for display and typing. */
export function formatMaintenancePin(value = '') {
  const digits = normalizeMaintenancePin(value);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

export function isCompleteMaintenancePin(value = '') {
  return normalizeMaintenancePin(value).length === MAINTENANCE_PIN_LENGTH;
}

/** Constant-time compare for equal-length hex strings. */
export function hashesEqual(left = '', right = '') {
  const a = String(left || '');
  const b = String(right || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * SHA-256 hex of `pin:salt:sessionId`. Salt and session change every time a PIN is minted, so an
 * old PIN cannot unlock a later maintenance window even if someone kept the hash.
 * @param {string} pin
 * @param {string} salt
 * @param {string} sessionId
 */
export async function hashMaintenancePin(pin, salt, sessionId) {
  const normalized = normalizeMaintenancePin(pin);
  if (!normalized || !salt || !sessionId) return '';
  if (!globalThis.crypto?.subtle?.digest) throw new Error('This browser cannot verify a tester PIN.');
  const payload = new TextEncoder().encode(`${normalized}:${salt}:${sessionId}`);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function readStoredPass() {
  try {
    const raw = localStorage.getItem(MAINTENANCE_PASS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const sessionId = String(parsed.sessionId || '');
    const pinHash = String(parsed.pinHash || '');
    if (!sessionId || pinHash.length !== PIN_HASH_HEX_LENGTH) return null;
    return { sessionId, pinHash };
  } catch {
    return null;
  }
}

function writeStoredPass(sessionId, pinHash) {
  try {
    localStorage.setItem(MAINTENANCE_PASS_STORAGE_KEY, JSON.stringify({ sessionId, pinHash }));
  } catch {
    // Private mode can refuse localStorage; the PIN still unlocks this tab until reload.
  }
}

export function clearStoredMaintenancePass() {
  try {
    localStorage.removeItem(MAINTENANCE_PASS_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function storedPassMatches(status) {
  if (!status?.enabled || !status.sessionId || !status.pinHash) return false;
  const stored = readStoredPass();
  if (!stored) return false;
  return stored.sessionId === status.sessionId && hashesEqual(stored.pinHash, status.pinHash);
}

function emptyStatus() {
  return {
    pending: false,
    loaded: true,
    enabled: false,
    reason: '',
    sessionId: '',
    pinSalt: '',
    pinHash: '',
    updatedAt: null,
    updatedBy: '',
  };
}

/** @param {Record<string, any> | null | undefined} data */
export function parseMaintenanceStatus(data) {
  if (!data || typeof data !== 'object') return emptyStatus();
  const enabled = data.enabled === true;
  const reason = String(data.reason || '').slice(0, MAINTENANCE_REASON_MAX);
  const sessionId = String(data.sessionId || '');
  const pinSalt = String(data.pinSalt || '');
  const pinHash = String(data.pinHash || '');
  return {
    pending: false,
    loaded: true,
    enabled,
    reason,
    sessionId,
    pinSalt,
    pinHash,
    updatedAt: data.updatedAt || null,
    updatedBy: String(data.updatedBy || ''),
  };
}

function applyStatus(next) {
  const previousSession = state.maintenance.sessionId;
  state.maintenance = next;
  state.maintenanceUnlocked = storedPassMatches(next);
  if (!next.enabled) {
    state.maintenancePlainPin = '';
    state.maintenancePinError = '';
    clearStoredMaintenancePass();
  } else if (previousSession && previousSession !== next.sessionId) {
    // A new window (or a regenerated PIN) invalidates the plaintext copy on this admin device too
    // unless this is the device that just minted it.
    if (!state.maintenancePlainPin) state.maintenanceUnlocked = storedPassMatches(next);
  }
}

/**
 * Subscribe to `site/status`. Safe to call once; a missing document means the arcade is open.
 */
export function watchMaintenance() {
  if (!firebaseReady || !store) {
    state.maintenance.pending = false;
    return;
  }
  state.maintenance.pending = true;
  onSnapshot(doc(store, 'site', 'status'), (snapshot) => {
    applyStatus(snapshot.exists() ? parseMaintenanceStatus(snapshot.data()) : emptyStatus());
    render();
  }, (error) => {
    console.warn('[PSD-gaming] Maintenance status could not be watched:', error?.message || error);
    state.maintenance.pending = false;
    state.maintenance.loaded = true;
    render();
  });
}

function requireAdmin() {
  if (!firebaseReady || !store) throw new Error('Firebase is not configured, so maintenance cannot be changed.');
  if (!state.isAdmin || !state.user?.uid) throw new Error('Only an administrator can change maintenance mode.');
}

/**
 * @param {{ enabled: boolean, reason?: string, rotatePin?: boolean }} options
 * @returns {Promise<string>} plaintext PIN when a new one was minted, otherwise ''
 */
export async function saveMaintenance({ enabled, reason, rotatePin = false }) {
  requireAdmin();
  const nextReason = String(reason ?? state.maintenance.reason ?? '').trim().slice(0, MAINTENANCE_REASON_MAX);
  const shouldMint = enabled && (rotatePin || !state.maintenance.enabled || !state.maintenance.pinHash);
  let pin = '';
  let sessionId = state.maintenance.sessionId || '';
  let pinSalt = state.maintenance.pinSalt || '';
  let pinHash = state.maintenance.pinHash || '';
  if (!enabled) {
    sessionId = '';
    pinSalt = '';
    pinHash = '';
  } else if (shouldMint) {
    pin = generateMaintenancePin();
    sessionId = randomHex(16);
    pinSalt = randomHex(16);
    pinHash = await hashMaintenancePin(pin, pinSalt, sessionId);
  } else if (pinHash.length !== PIN_HASH_HEX_LENGTH || pinSalt.length < 16 || sessionId.length < 16) {
    throw new Error('Maintenance status has not loaded yet. Wait a moment and try again.');
  }
  state.maintenanceSaving = true;
  render();
  try {
    await setDoc(doc(store, 'site', 'status'), {
      enabled: Boolean(enabled),
      reason: nextReason,
      sessionId,
      pinSalt,
      pinHash,
      updatedAt: serverTimestamp(),
      updatedBy: state.user.uid,
    });
    if (pin) {
      state.maintenancePlainPin = pin;
      writeStoredPass(sessionId, pinHash);
      state.maintenanceUnlocked = true;
    }
    if (!enabled) {
      state.maintenancePlainPin = '';
      clearStoredMaintenancePass();
      state.maintenanceUnlocked = false;
    }
    return pin;
  } finally {
    state.maintenanceSaving = false;
    render();
  }
}

export async function enableMaintenance(reason) {
  const pin = await saveMaintenance({ enabled: true, reason, rotatePin: true });
  showToast('Maintenance is on. Copy the tester PIN before you leave this page.');
  return pin;
}

export async function disableMaintenance() {
  await saveMaintenance({ enabled: false, reason: state.maintenance.reason });
  showToast('The arcade is open to everyone again.');
}

export async function regenerateMaintenancePin() {
  if (!state.maintenance.enabled) throw new Error('Turn maintenance on before minting a tester PIN.');
  const pin = await saveMaintenance({ enabled: true, reason: state.maintenance.reason, rotatePin: true });
  showToast('A new 16-digit tester PIN is ready. The old one no longer works.');
  return pin;
}

export async function saveMaintenanceReason(reason) {
  const pin = await saveMaintenance({
    enabled: state.maintenance.enabled,
    reason,
    rotatePin: false,
  });
  showToast(state.maintenance.enabled ? 'Maintenance message saved.' : 'Message saved. It will show when you turn maintenance on.');
  return pin;
}

/**
 * Check a typed PIN against the current maintenance window. On success this device can use the
 * arcade until the PIN is regenerated or maintenance is turned off.
 * @param {string} rawPin
 */
export async function unlockWithMaintenancePin(rawPin) {
  const pin = normalizeMaintenancePin(rawPin);
  state.maintenancePinError = '';
  if (!state.maintenance.enabled) {
    state.maintenancePinError = 'The arcade is not in maintenance right now.';
    render();
    return false;
  }
  if (!isCompleteMaintenancePin(pin)) {
    state.maintenancePinError = 'Enter all 16 digits of the tester PIN.';
    render();
    return false;
  }
  if (!state.maintenance.pinSalt || !state.maintenance.sessionId || !state.maintenance.pinHash) {
    state.maintenancePinError = 'No tester PIN is active. Ask the admin to turn maintenance on again.';
    render();
    return false;
  }
  const pinHash = await hashMaintenancePin(pin, state.maintenance.pinSalt, state.maintenance.sessionId);
  if (!hashesEqual(pinHash, state.maintenance.pinHash)) {
    state.maintenancePinError = 'That PIN does not match this maintenance window.';
    render();
    return false;
  }
  writeStoredPass(state.maintenance.sessionId, pinHash);
  state.maintenanceUnlocked = true;
  state.maintenancePinError = '';
  render();
  showToast('Tester access granted. You can use the arcade on this device.');
  return true;
}
