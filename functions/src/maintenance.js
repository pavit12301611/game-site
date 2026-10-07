/**
 * The tester PIN's cryptography, kept in one small module so the handlers stay readable and the
 * tests can attack the PIN handling directly.
 *
 * A PIN protects nothing that the Firestore rules do not already protect - it only lets a handful of
 * invited testers look at the arcade while it is "closed". It is still treated as a credential:
 *
 *   - it is generated with the platform CSPRNG (`randomInt`, not `Math.random`),
 *   - Firestore stores a salted SHA-256 hash (`maintenanceGate/active`), never the digits,
 *   - the comparison is constant time, so a wrong PIN cannot be measured digit by digit,
 *   - and the only time the digits exist in a response is the admin callable that just minted them.
 */

import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

/** A fresh PIN: `length` digits, each drawn independently from the CSPRNG. */
export function generateMaintenancePin(length = 16) {
  let pin = '';
  for (let index = 0; index < length; index += 1) pin += String(randomInt(0, 10));
  return pin;
}

/** A fresh per-PIN salt, so two maintenance windows never share a hash for the same digits. */
export function generateMaintenanceSalt() {
  return randomUUID().replace(/-/g, '');
}

/**
 * The stored verifier: `sha256('<salt>:<pin>')` in hex. The digits are not recoverable from it, and
 * the salt means an attacker holding the document cannot precompute a rainbow table of 16-digit PINs.
 * @param {string} pin @param {string} salt
 */
export function hashMaintenancePin(pin, salt) {
  return createHash('sha256').update(`${salt}:${pin}`).digest('hex');
}

/**
 * Constant-time check of one typed PIN against the stored gate document. A malformed document (no
 * salt, no hash, a hash of the wrong length, a string where an object belongs) answers `false`
 * instead of throwing: the gate must fail closed.
 * @param {string} pin @param {unknown} gate
 */
export function verifyMaintenancePin(pin, gate) {
  const source = gate && typeof gate === 'object' ? /** @type {Record<string, any>} */ (gate) : {};
  if (typeof source.salt !== 'string' || typeof source.pinHash !== 'string') return false;
  if (!/^[0-9a-f]{64}$/i.test(source.pinHash)) return false;
  const expected = Buffer.from(hashMaintenancePin(String(pin), source.salt), 'hex');
  const stored = Buffer.from(source.pinHash, 'hex');
  if (expected.length !== stored.length) return false;
  return timingSafeEqual(expected, stored);
}
