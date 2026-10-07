/**
 * Maintenance mode policy, shared between browser and backend.
 *
 * Covers the 16-digit code format, reason limits, the salted digest, the lock decision,
 * and the two Firestore document shapes. No DOM, no Firebase.
 */

export const MAINTENANCE_PIN_DIGITS = 16;
export const MAINTENANCE_PIN_DEFAULT_HOURS = 24;
export const MAINTENANCE_REASON_MAX = 500;

/**
 * Strips everything except digits from a pin string.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeMaintenancePin(raw) {
  return String(raw || '').replace(/\D/g, '').slice(0, MAINTENANCE_PIN_DIGITS);
}

/**
 * Formats a pin as groups of 4 digits.
 * @param {string} digits
 * @returns {string}
 */
export function formatMaintenancePin(digits) {
  const d = normalizeMaintenancePin(digits);
  const groups = [];
  for (let i = 0; i < d.length; i += 4) groups.push(d.slice(i, i + 4));
  return groups.join(' ');
}

/**
 * Whether a pass is still valid for the current maintenance window.
 * @param {{ digest: string, expiresAtMs: number } | null} pass
 * @param {{ pinHash: string, pinExpiresAtMs: number }} maintenance
 * @returns {boolean}
 */
export function maintenancePassIsValid(pass, maintenance) {
  if (!pass || !pass.digest || !pass.expiresAtMs) return false;
  if (!maintenance.pinHash || !maintenance.pinExpiresAtMs) return false;
  return pass.digest === maintenance.pinHash && pass.expiresAtMs >= Date.now();
}

/**
 * Whether this viewer is locked out by maintenance mode.
 * @param {{ enabled: boolean, pinHash: string, pass: any, pinExpired?: boolean }} maintenance
 * @param {{ isAdmin: boolean, passValid: boolean }} context
 * @returns {boolean}
 */
export function isMaintenanceLocked(maintenance, { isAdmin, passValid }) {
  if (!maintenance.enabled) return false;
  if (isAdmin) return false;
  if (passValid) return false;
  return true;
}