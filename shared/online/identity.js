/**
 * Identity rules shared by the browser and the trusted backend: what a username may look like, and
 * what a display name may contain.
 *
 * The backend re-validates everything it is sent with these functions, so the browser copy is a
 * convenience (instant feedback), never the control. This module has no imports and no browser APIs
 * on purpose: Cloud Functions load it too.
 */

/** Usernames are 3–18 characters of [a-z0-9_], case-insensitively unique. */
export const USERNAME_REGEX = /^[a-z0-9_]{3,18}$/;
export const DISPLAY_NAME_MAX = 20;
export const REPORT_MESSAGE_MAX = 400;

/**
 * @param {unknown} rawUsername
 * @returns {{ ok: boolean, username: string, usernameLower: string, error: string }}
 */
export function validateUsername(rawUsername) {
  const username = String(rawUsername ?? '').trim();
  const usernameLower = username.toLowerCase();
  if (!username) {
    return { ok: false, username: '', usernameLower: '', error: 'Choose a username between 3 and 18 characters.' };
  }
  if (username.length < 3 || username.length > 18) {
    return { ok: false, username, usernameLower, error: 'Usernames must be 3–18 characters long.' };
  }
  if (!USERNAME_REGEX.test(usernameLower)) {
    return { ok: false, username, usernameLower, error: 'Usernames must be 3–18 characters: letters, numbers, or underscores.' };
  }
  return { ok: true, username, usernameLower, error: '' };
}

/**
 * Normalizes arbitrary text (a Google display name, an email prefix) into lowercase characters that
 * are valid in a username.
 * @param {unknown} input
 */
export function sanitizeUsernameSeed(input = '') {
  const ascii = String(input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return ascii
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Suggests a valid username from a display name and/or email address, optionally with a suffix.
 * @param {unknown} displayName
 * @param {unknown} email
 * @param {unknown} suffix
 */
export function suggestUsername(displayName = '', email = '', suffix = '') {
  const emailLocal = String(email ?? '').split('@')[0] || '';
  let base = sanitizeUsernameSeed(displayName);
  if (base.length < 3) base = sanitizeUsernameSeed(emailLocal);
  if (!base) base = 'player';
  if (base.length < 3) base = `${base}_player`.replace(/^_+|_+$/g, '');

  const cleanSuffix = sanitizeUsernameSeed(suffix);
  if (cleanSuffix) {
    const maxBaseLength = Math.max(3, 18 - cleanSuffix.length - 1);
    const trimmedBase = base.slice(0, maxBaseLength).replace(/_+$/g, '');
    const combined = `${trimmedBase}_${cleanSuffix}`.replace(/_+/g, '_').slice(0, 18).replace(/_+$/g, '');
    if (USERNAME_REGEX.test(combined)) return combined;
  }

  let candidate = base.slice(0, 18).replace(/_+$/g, '');
  while (candidate.length < 3) candidate = `${candidate}x`;
  return candidate.slice(0, 18);
}

/**
 * The name other players see: a claimed username for accounts, otherwise a device display name.
 * Control characters and markup-significant characters are stripped; length is capped.
 * @param {unknown} value
 * @param {string} [fallback]
 */
export function safeDisplayName(value, fallback = 'Player') {
  const cleaned = String(value ?? '')
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DISPLAY_NAME_MAX);
  return cleaned || fallback;
}

/** @param {unknown} value @param {number} [max] */
export function safeMessage(value, max = REPORT_MESSAGE_MAX) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
