/**
 * Username validation and display-name logic, shared between browser and backend.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 18;
export const DISPLAY_NAME_MAX = 20;
export const USERNAME_REGEX = /^[a-z0-9_-]+$/i;

/**
 * Validates a username string.
 * @param {string} name
 * @returns {{ ok: boolean, reason: string }}
 */
export function validateUsername(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return { ok: false, reason: 'Username is required.' };
  if (trimmed.length < USERNAME_MIN) return { ok: false, reason: `Username must be at least ${USERNAME_MIN} characters.` };
  if (trimmed.length > USERNAME_MAX) return { ok: false, reason: `Username must be at most ${USERNAME_MAX} characters.` };
  if (!USERNAME_REGEX.test(trimmed)) return { ok: false, reason: 'Username may only contain letters, numbers, hyphens and underscores.' };
  return { ok: true, reason: '' };
}

/**
 * Sanitizes a display name (e.g. from Google) into a valid username seed.
 * @param {string} name
 * @returns {string}
 */
export function sanitizeUsernameSeed(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, USERNAME_MAX);
}

/**
 * Suggests a username from a display name or email.
 * @param {string | null | undefined} displayName
 * @param {string | null | undefined} email
 * @returns {string}
 */
export function suggestUsername(displayName, email) {
  const fromName = sanitizeUsernameSeed(displayName || '');
  if (fromName.length >= USERNAME_MIN) return fromName;
  const fromEmail = sanitizeUsernameSeed((email || '').split('@')[0]);
  if (fromEmail.length >= USERNAME_MIN) return fromEmail;
  return '';
}