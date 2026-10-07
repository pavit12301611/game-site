/**
 * Maintenance mode: the site-wide "this arcade is being worked on" switch.
 *
 * Three decisions live in this file, because all three are shared by whoever touches the feature —
 * the browser (which paints the notice and checks a code), the admin studio (which writes the
 * switch, the reason and the code) and the tests (which must agree on the exact document shape that
 * `firestore.rules` accepts):
 *
 *   1. **The documents.** `siteStatus/maintenance` is the public projection: it says whether the
 *      site is closed and why. `maintenanceAccess/active` holds the access code itself and is
 *      readable by admins only, so a visitor can never read the code they are being asked for.
 *   2. **The code.** Sixteen digits, generated when maintenance is switched on (and on every
 *      rotation), never reused, and never stored in plain view: the public document carries only
 *      `pinHash = digest(pinSalt + pin)`. A device that types the right code keeps access until the
 *      code expires or the operator rotates it — because the stored pass *is* that same digest, a
 *      rotation invalidates every device at once.
 *   3. **The wording.** The operator's reason is free text, capped and control-character-free, so it
 *      can be painted on a public page without escaping surprises.
 *
 * Deliberately dependency-free (no DOM, no Firebase): `shared/**` is mirrored into Cloud Functions by
 * scripts/sync-shared.mjs, so a trusted backend could mint the same documents later.
 */

/** The public projection: `{ enabled, reason, pinHash, … }`. One document, fixed id. */
export const MAINTENANCE_STATUS_COLLECTION = 'siteStatus';
export const MAINTENANCE_STATUS_DOCUMENT = 'maintenance';
/** The admin-only document that holds the code itself, so it can be shown again later. */
export const MAINTENANCE_ACCESS_COLLECTION = 'maintenanceAccess';
export const MAINTENANCE_ACCESS_DOCUMENT = 'active';

/**
 * Every field `firestore.rules` allows in each document, in one list. `tests/firestore-rules.test.js`
 * asserts that each name here appears in the rules file, so the two cannot drift apart.
 */
export const MAINTENANCE_STATUS_FIELDS = Object.freeze([
  'enabled', 'reason', 'updatedAtMs', 'updatedByUid', 'pinHash', 'pinSalt', 'pinExpiresAtMs', 'pinSetAtMs',
]);
export const MAINTENANCE_ACCESS_FIELDS = Object.freeze([
  'pin', 'pinHash', 'pinSalt', 'expiresAtMs', 'setAtMs', 'hours', 'updatedByUid',
]);

/** A 16-digit code: long enough that guessing it is not a plan, short enough to text to a friend. */
export const MAINTENANCE_PIN_DIGITS = 16;
/** How the code is grouped for reading and typing: 4-4-4-4. */
export const MAINTENANCE_PIN_GROUP_SIZE = 4;
/** Only digits may be typed; a paste with spaces or dashes is normalised, not rejected. */
const PIN_ANY_DIGITS = /\D/g;

/** The operator's reason: long enough for a real sentence, short enough for a poster-sized panel. */
export const MAINTENANCE_REASON_MAX = 500;
export const MAINTENANCE_REASON_LINES_MAX = 6;

/** How long a code (and therefore every device unlocked with it) stays valid. */
export const MAINTENANCE_PIN_DURATIONS = Object.freeze([
  Object.freeze({ hours: 1, label: '1 hour' }),
  Object.freeze({ hours: 6, label: '6 hours' }),
  Object.freeze({ hours: 24, label: '24 hours' }),
  Object.freeze({ hours: 72, label: '3 days' }),
  Object.freeze({ hours: 168, label: '7 days' }),
]);
export const MAINTENANCE_PIN_DEFAULT_HOURS = 24;

/** Wrong-code attempts are throttled per device: a nuisance for guessing, invisible for a typo. */
export const MAINTENANCE_MAX_ATTEMPTS = 6;
export const MAINTENANCE_COOLDOWN_MS = 5 * 60 * 1000;

/** Tags the stored digest with the algorithm that produced it, so two browsers can never disagree. */
export const MAINTENANCE_DIGEST_SHA256 = 'sha256';
export const MAINTENANCE_DIGEST_FALLBACK = 'fnv1a8';

/** @param {unknown} raw @returns {string} exactly the digits a visitor means to type, capped at 16. */
export function normalizeMaintenancePin(raw) {
  return String(raw ?? '').replace(PIN_ANY_DIGITS, '').slice(0, MAINTENANCE_PIN_DIGITS);
}

/** @param {unknown} raw @param {string} [separator] @returns {string} "1234 5678 9012 3456". */
export function formatMaintenancePin(raw, separator = ' ') {
  const digits = normalizeMaintenancePin(raw);
  const groups = [];
  for (let i = 0; i < digits.length; i += MAINTENANCE_PIN_GROUP_SIZE) {
    groups.push(digits.slice(i, i + MAINTENANCE_PIN_GROUP_SIZE));
  }
  return groups.join(separator);
}

/** How many digits somebody actually typed, counted before anything is trimmed to the limit. */
export function maintenancePinLength(raw) {
  return String(raw ?? '').replace(PIN_ANY_DIGITS, '').length;
}

/**
 * A code is exactly 16 digits — nothing shorter, nothing longer. The count is deliberately taken
 * before the truncation that `normalizeMaintenancePin` applies: a paste that drags three stray digits
 * along with it is a mistake worth reporting, not a code to silently shorten.
 * @param {unknown} raw
 */
export function isValidMaintenancePin(raw) {
  return maintenancePinLength(raw) === MAINTENANCE_PIN_DIGITS;
}

/**
 * The operator's reason, safe to paint on a public page.
 * @param {unknown} raw
 * @returns {{ ok: boolean, reason: string, error: string }}
 */
export function safeMaintenanceReason(raw) {
  const lines = String(raw ?? '')
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0);
  const reason = lines.slice(0, MAINTENANCE_REASON_LINES_MAX).join('\n');
  if (reason.length > MAINTENANCE_REASON_MAX) {
    return { ok: false, reason, error: `Keep it under ${MAINTENANCE_REASON_MAX} characters (${reason.length} now).` };
  }
  return { ok: true, reason, error: '' };
}

/** @param {unknown} hours @returns {number} milliseconds a code stays valid for */
export function maintenancePinWindowMs(hours) {
  const wanted = Number(hours);
  const match = MAINTENANCE_PIN_DURATIONS.find((option) => option.hours === wanted);
  return (match ? match.hours : MAINTENANCE_PIN_DEFAULT_HOURS) * 60 * 60 * 1000;
}

/** One sentence, one place: how a code looks and how it is typed. Used by the notice and the studio. */
export function maintenancePinGroupHint() {
  const groups = MAINTENANCE_PIN_DIGITS / MAINTENANCE_PIN_GROUP_SIZE;
  return `${MAINTENANCE_PIN_DIGITS} digits in ${groups} groups of ${MAINTENANCE_PIN_GROUP_SIZE}`;
}

/**
 * Uniform 16 digits, by rejection sampling: bytes 0-249 map onto 0-9 evenly (250 = 25 × 10), and
 * anything above is thrown away, so no digit is likelier than another.
 * @param {(length: number) => Uint8Array} [randomBytes] injectable for tests
 */
export function randomMaintenancePin(randomBytes = defaultRandomBytes) {
  const bytes = randomBytes(MAINTENANCE_PIN_DIGITS * 8);
  let pin = '';
  for (let i = 0; i < bytes.length && pin.length < MAINTENANCE_PIN_DIGITS; i += 1) {
    if (bytes[i] < 250) pin += String(bytes[i] % 10);
  }
  while (pin.length < MAINTENANCE_PIN_DIGITS) pin += '0';
  return pin;
}

/** @param {(length: number) => Uint8Array} [randomBytes] @returns {string} 16 hex characters */
export function randomMaintenanceSalt(randomBytes = defaultRandomBytes) {
  const bytes = randomBytes(8);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** @param {number} length @returns {Uint8Array} */
function defaultRandomBytes(length) {
  const bytes = new Uint8Array(length);
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/**
 * `algorithm:hex` for a code, keyed by the per-maintenance salt.
 *
 * SHA-256 through Web Crypto whenever the browser has it (every secure context does). The fallback is
 * a pure-JS 8-lane FNV-1a: weaker, but the code is a 10^16-space secret and the gate it protects is a
 * soft one (see docs/maintenance-mode.md), and it keeps the feature working over plain http on a LAN.
 * The algorithm is part of the stored value so a mismatch is a clear "wrong device context" rather
 * than a mystery.
 *
 * @param {string} salt @param {string} pin @returns {Promise<string>}
 */
export async function maintenancePinDigest(salt, pin) {
  const input = `psd-maintenance-v1|${salt}|${normalizeMaintenancePin(pin)}`;
  const subtle = globalThis.crypto?.subtle;
  if (subtle?.digest) {
    const buffer = await subtle.digest('SHA-256', new TextEncoder().encode(input));
    return `${MAINTENANCE_DIGEST_SHA256}:${toHex(new Uint8Array(buffer))}`;
  }
  return `${MAINTENANCE_DIGEST_FALLBACK}:${fnv1a8Hex(input)}`;
}

/** @param {Uint8Array} bytes */
function toHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** @param {string} input @returns {string} 64 hex characters from eight independent mixing lanes */
function fnv1a8Hex(input) {
  const seeds = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f, 0x165667b1, 0x9e3779b1];
  return seeds.map((seed, lane) => {
    let hash = seed >>> 0;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= (input.charCodeAt(i) + lane * 31) & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
      hash = (hash ^ (hash >>> 13)) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }).join('');
}

/**
 * The exact document `firestore.rules` accepts for `siteStatus/maintenance`. Building it in one place
 * means a client cannot send a field the rules would reject (and lose the write) or omit one it needs.
 *
 * @param {{ enabled: boolean, reason?: string, pinDigest?: string, salt?: string, pinExpiresAtMs?: number, pinSetAtMs?: number, uid: string, nowMs?: number }} input
 */
export function buildMaintenanceStatusUpdate(input) {
  const nowMs = Math.floor(Number(input?.nowMs) || Date.now());
  const enabled = Boolean(input?.enabled);
  const pinDigest = enabled ? String(input?.pinDigest || '') : '';
  return {
    enabled,
    reason: enabled ? safeMaintenanceReason(input?.reason).reason : '',
    updatedAtMs: nowMs,
    updatedByUid: String(input?.uid || ''),
    pinHash: pinDigest,
    pinSalt: pinDigest ? String(input?.salt || '') : '',
    pinExpiresAtMs: pinDigest ? Math.floor(Number(input?.pinExpiresAtMs) || 0) : 0,
    pinSetAtMs: pinDigest ? Math.floor(Number(input?.pinSetAtMs) || nowMs) : 0,
  };
}

/**
 * The exact document `firestore.rules` accepts for `maintenanceAccess/active`.
 * @param {{ pin: string, pinDigest: string, salt: string, expiresAtMs: number, hours: number, uid: string, nowMs?: number, setAtMs?: number }} input
 */
export function buildMaintenanceAccessUpdate(input) {
  const nowMs = Math.floor(Number(input?.nowMs) || Date.now());
  const pin = normalizeMaintenancePin(input?.pin);
  return {
    pin,
    pinHash: String(input?.pinDigest || ''),
    pinSalt: String(input?.salt || ''),
    expiresAtMs: Math.floor(Number(input?.expiresAtMs) || 0),
    setAtMs: Math.floor(Number(input?.setAtMs) || nowMs),
    hours: Math.floor(Number(input?.hours) || MAINTENANCE_PIN_DEFAULT_HOURS),
    updatedByUid: String(input?.uid || ''),
  };
}

/**
 * Does a stored device pass still open this site?
 *
 * A pass is the digest of the code that was typed, so it is worth exactly as much as the code: when
 * the operator rotates the code the digest no longer matches and every device is locked out again —
 * that is the revoke button, and it needs no extra plumbing.
 *
 * @param {{ digest?: string, expiresAtMs?: number } | null | undefined} pass
 * @param {{ enabled?: boolean, pinHash?: string, pinExpiresAtMs?: number } | null | undefined} status
 * @param {number} [nowMs]
 */
export function maintenancePassIsValid(pass, status, nowMs = Date.now()) {
  const digest = String(pass?.digest || '');
  if (!digest || !status?.enabled) return false;
  if (digest !== status.pinHash) return false;
  const expiresAtMs = Math.min(Number(pass?.expiresAtMs) || 0, Number(status?.pinExpiresAtMs) || 0);
  return expiresAtMs > nowMs;
}

/**
 * The one question the render path asks: may this viewer see the arcade right now?
 *
 * Order matters: an admin who asked to *preview* the visitor screen sees the notice (that is what
 * they asked for), any other admin sees the site, and everyone else needs a live pass.
 *
 * @param {{ enabled?: boolean, preview?: boolean } | null | undefined} maintenance
 * @param {{ isAdmin?: boolean, passValid?: boolean }} viewer
 */
export function isMaintenanceLocked(maintenance, { isAdmin = false, passValid = false } = {}) {
  if (!maintenance?.enabled) return false;
  if (maintenance.preview) return true;
  if (isAdmin) return false;
  return !passValid;
}

/**
 * Is the code in this status document still usable? Drives the admin studio's "expired" hint and the
 * visitor's error message when the operator left maintenance on for too long.
 * @param {{ pinHash?: string, pinExpiresAtMs?: number } | null | undefined} status
 * @param {number} [nowMs]
 */
export function maintenancePinIsLive(status, nowMs = Date.now()) {
  return Boolean(status?.pinHash) && Number(status?.pinExpiresAtMs) > nowMs;
}

/**
 * Has this device typed the code wrong often enough to cool down?
 * @param {{ count?: number, lockedUntilMs?: number } | null | undefined} attempts
 * @param {number} [nowMs]
 */
export function maintenanceAttemptsLocked(attempts, nowMs = Date.now()) {
  const lockedUntilMs = Number(attempts?.lockedUntilMs) || 0;
  return lockedUntilMs > nowMs ? lockedUntilMs - nowMs : 0;
}

/**
 * Records one wrong code and returns the new attempt record.
 * @param {{ count?: number, lockedUntilMs?: number } | null | undefined} attempts
 * @param {number} [nowMs]
 */
export function registerMaintenanceAttempt(attempts, nowMs = Date.now()) {
  const count = (Number(attempts?.count) || 0) + 1;
  if (count < MAINTENANCE_MAX_ATTEMPTS) return { count, lockedUntilMs: 0 };
  return { count: 0, lockedUntilMs: nowMs + MAINTENANCE_COOLDOWN_MS };
}

/** @param {unknown} value @returns {number} ms since that moment, floored at zero */
export function maintenanceAgeMs(value, nowMs = Date.now()) {
  const at = Number(value) || 0;
  return at ? Math.max(0, nowMs - at) : 0;
}
