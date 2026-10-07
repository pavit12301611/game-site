/**
 * Maintenance mode, shared by the browser and the trusted backend.
 *
 * Two documents are behind this feature, and only one of them is public:
 *
 *   maintenance/status      what every visitor may read: `enabled`, the message to show, who last
 *                           changed it and which PIN generation is current. No secrets, ever.
 *   maintenanceGate/active  the tester PIN, stored as a salted SHA-256 hash. No client may read or
 *                           write this collection (`firestore.rules`), and the plaintext PIN only
 *                           ever leaves the server in the admin callable's own response.
 *
 * Everything in this module is pure: no DOM, no Firestore, no `node:` imports, so the same
 * validation runs in the browser, in the Cloud Functions and in the tests. `safeMaintenanceStatus`
 * never throws and never returns something surprising for a missing or malformed document - it
 * answers "not in maintenance", because a broken document must not be able to lock the arcade out.
 */

/** The collection holding the one document every visitor may read. */
export const MAINTENANCE_STATUS_COLLECTION = 'maintenance';
export const MAINTENANCE_STATUS_DOC_ID = 'status';
/** The server-only document holding the salted hash of the current tester PIN. */
export const MAINTENANCE_GATE_COLLECTION = 'maintenanceGate';
export const MAINTENANCE_GATE_DOC_ID = 'active';

/** How long the operator's message may be, in characters. Enforced here and in the rules. */
export const MAINTENANCE_MESSAGE_MAX = 400;
/** The tester PIN is exactly this many digits, and nothing else. */
export const MAINTENANCE_PIN_LENGTH = 16;
/** Shown when an operator enables maintenance without writing a message of their own. */
export const MAINTENANCE_DEFAULT_MESSAGE = 'PSD-gaming is getting a quick tune-up. Games, reviews and online rooms come back in a few minutes.';

/** The fields an admin may touch through the rules; the Cloud Function writes a few more. */
export const MAINTENANCE_ADMIN_FIELDS = Object.freeze(['enabled', 'message', 'updatedAtMs', 'updatedBy']);

/**
 * Cleans one operator-written message: control characters out, whitespace collapsed, length capped.
 * An empty or unreadable value answers `''` so the caller can fall back to the default sentence.
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizeMaintenanceMessage(value) {
  if (typeof value !== 'string') return '';
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAINTENANCE_MESSAGE_MAX);
}

/**
 * One typed PIN, without the spaces or dashes a person adds when reading 16 digits out loud.
 * Nothing else is removed: letters stay letters, because silently "fixing" them would hide a typo.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeMaintenancePin(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/[\s\u00A0\u2013\u2014_-]/g, '');
}

/** @param {unknown} value */
export function isValidMaintenancePin(value) {
  return new RegExp(`^\\d{${MAINTENANCE_PIN_LENGTH}}$`).test(normalizeMaintenancePin(value));
}

/**
 * The public maintenance document as the app should read it, whatever Firestore (or a hand-edited
 * document, or a failed read) actually holds.
 *
 * Missing, `null`, a string, a document whose `message` is an object, a negative `pinVersion`: every
 * one of them lands on this shape, and only an explicit `enabled === true` closes the arcade.
 * @param {unknown} raw
 * @returns {{ enabled: boolean, message: string, updatedAtMs: number, updatedBy: string, pinVersion: number, pinActive: boolean, missing: boolean }}
 */
export function safeMaintenanceStatus(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? /** @type {Record<string, any>} */ (raw) : {};
  const message = sanitizeMaintenanceMessage(source.message);
  const version = Number(source.pinVersion);
  const pinVersion = Number.isFinite(version) && version > 0 ? Math.floor(version) : 0;
  const updatedAtMs = Number(source.updatedAtMs);
  return {
    enabled: source.enabled === true,
    message: message || MAINTENANCE_DEFAULT_MESSAGE,
    updatedAtMs: Number.isFinite(updatedAtMs) && updatedAtMs > 0 ? updatedAtMs : 0,
    updatedBy: typeof source.updatedBy === 'string' ? source.updatedBy.slice(0, 128) : '',
    pinVersion,
    // A PIN is live only when the server said so *and* there is a generation to match it against.
    pinActive: source.pinActive === true && pinVersion > 0,
    missing: Object.keys(source).length === 0,
  };
}

/**
 * Should this visitor see the maintenance page instead of the arcade?
 *
 * Verified admins always keep the whole app: the studio is where maintenance mode is switched off,
 * so locking them out would be a one-way door. A visitor who redeemed the current tester PIN also
 * steps through - a pass only counts while it matches the live PIN generation, so a PIN from an
 * earlier maintenance window does not open this one.
 * @param {ReturnType<typeof safeMaintenanceStatus> | Record<string, any> | null | undefined} status
 * @param {{ isAdmin?: boolean, unlocked?: boolean }} [options]
 */
export function maintenanceIsActive(status, { isAdmin = false, unlocked = false } = {}) {
  return Boolean(status?.enabled) && !isAdmin && !unlocked;
}

/**
 * Does a stored tester pass still match the live maintenance window?
 * @param {{ token?: unknown, pinVersion?: unknown } | null | undefined} pass
 * @param {ReturnType<typeof safeMaintenanceStatus>} status
 */
export function maintenancePassMatches(pass, status) {
  const token = typeof pass?.token === 'string' ? pass.token.trim() : '';
  if (!token || token.length > 128) return false;
  if (!status?.enabled || !status?.pinActive) return false;
  return Math.floor(Number(pass?.pinVersion) || 0) === status.pinVersion;
}
