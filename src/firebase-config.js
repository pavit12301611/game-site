/**
 * Reads and validates the public Firebase Web config stored in VITE_FIREBASE_CONFIG.
 *
 * This is a pure module: no Firebase SDK, no `import.meta.env`, no DOM. The exact same rules
 * are shared by the browser bundle (src/firebase.js), the Vite build check
 * (scripts/firebase-env-check.js) and the node:test suite, so "what counts as a valid config"
 * lives in one place.
 *
 * Nothing in here ever echoes the raw value back in a message. A mis-pasted secret must not end
 * up in a console, a toast or a build log.
 */

export const FIREBASE_CONFIG_ENV_NAME = 'VITE_FIREBASE_CONFIG';
export const REQUIRED_FIREBASE_FIELDS = Object.freeze(['apiKey', 'authDomain', 'projectId', 'appId']);

/**
 * One environment variable per Firebase Web config field (the recommended setup on Vercel).
 * Keys are the field names of the Firebase config object, values are the variable names.
 * Only the four REQUIRED_FIREBASE_FIELDS have to be set; the rest are optional.
 */
export const FIREBASE_ENV_VARS = Object.freeze({
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
  measurementId: 'VITE_FIREBASE_MEASUREMENT_ID',
});
/** Every variable name the app reads (the per-field ones plus the legacy one-line JSON one). */
export const FIREBASE_ENV_NAMES = Object.freeze([...Object.values(FIREBASE_ENV_VARS), FIREBASE_CONFIG_ENV_NAME]);

const ENV = FIREBASE_CONFIG_ENV_NAME;

// Key names that only exist in service-account key files / OAuth client files, never in a
// Firebase Web app config. Compared after lower-casing and stripping non-alphanumerics, so
// `private_key`, `privateKey` and `PRIVATE-KEY` all match.
const SECRET_KEY_LABELS = new Map([
  ['privatekey', 'private_key'],
  ['privatekeyid', 'private_key_id'],
  ['clientemail', 'client_email'],
  ['clientsecret', 'client_secret'],
  ['refreshtoken', 'refresh_token'],
  ['accesstoken', 'access_token'],
]);
const PEM_PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const GOOGLE_OAUTH_CLIENT_SECRET = /GOCSPX-[A-Za-z0-9_-]{8,}/;
const SERVICE_ACCOUNT_TYPE = /["']type["']\s*:\s*["']service_account["']/;

// Only unmistakable placeholder syntax is rejected, so a real project whose name happens to
// contain "your" is never blocked: "...", "AIza...", <API_KEY>, ${API_KEY}, YOUR_API_KEY,
// and the literal "your-project" used by docs and .env.example.
const PLACEHOLDER_PATTERNS = [
  /\.{3}|…/,
  /^<[^>]*>$/,
  /^\$\{[^}]*\}$/,
  /YOUR_[A-Z0-9_]+/,
  /^your-project/i,
];
const AUTH_DOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/i;

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Returns human-readable labels (never values) for anything in `input` that looks like a
 * credential which must not be embedded in a public browser bundle. `input` may be the raw
 * string or an already-parsed object.
 */
export function findSecretMarkers(input) {
  const found = new Set();
  if (typeof input === 'string') {
    if (PEM_PRIVATE_KEY.test(input)) found.add('PEM private key block');
    if (GOOGLE_OAUTH_CLIENT_SECRET.test(input)) found.add('Google OAuth client secret');
    if (SERVICE_ACCOUNT_TYPE.test(input)) found.add('type: service_account');
    return [...found];
  }
  const visit = (value, depth) => {
    if (!value || typeof value !== 'object' || depth > 4) return;
    for (const [key, child] of Object.entries(value)) {
      const normalized = normalizeKey(key);
      const label = SECRET_KEY_LABELS.get(normalized);
      if (label) found.add(`${label} field`);
      if (normalized === 'type' && child === 'service_account') found.add('type: service_account');
      visit(child, depth + 1);
    }
  };
  visit(input, 0);
  return [...found];
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function missingHint(dev) {
  return dev
    ? 'Copy .env.example to .env.local, fill in the VITE_FIREBASE_* values from your Firebase Web app config, then restart the dev server.'
    : 'In Vercel: Project → Settings → Environment Variables → add the VITE_FIREBASE_* variables for the environment you are viewing (Production and/or Preview), then redeploy. Vite embeds VITE_* values at build time.';
}

function invalidHint(dev) {
  return dev
    ? 'Fix the value(s) in .env.local and restart npm run dev.'
    : 'Fix the value(s) in Vercel → Project → Settings → Environment Variables, then redeploy. Vite embeds VITE_* values at build time.';
}

/**
 * Parses the raw VITE_FIREBASE_CONFIG value (the legacy one-line JSON form).
 *
 * @param {unknown} rawValue  the raw env value (a string, or undefined when the variable is unset)
 * @param {{ dev?: boolean }} [options]  `dev` switches the fix instructions from "Vercel" to ".env.local"
 * @returns {{
 *   status: 'ok' | 'missing' | 'invalid',
 *   code: string,
 *   message: string,
 *   hint: string,
 *   config: Record<string, unknown> | null,
 *   missingFields: string[],
 * }}
 *   `config` is only set when `status === 'ok'`. `message` is always safe to show or log.
 */
export function parseFirebaseConfig(rawValue, options = {}) {
  return { ...parseJsonConfig(rawValue, options), source: 'json' };
}

function parseJsonConfig(rawValue, { dev = false } = {}) {
  const missing = (code, message) => ({
    status: 'missing', code, message, hint: missingHint(dev), config: null, missingFields: [...REQUIRED_FIREBASE_FIELDS],
  });
  const invalid = (code, message, extra = {}) => ({
    status: 'invalid', code, message, hint: invalidHint(dev), config: null, missingFields: [], ...extra,
  });

  if (rawValue === undefined || rawValue === null) {
    return missing('missing', dev
      ? `Firebase config is missing. Add ${ENV} to .env.local and restart npm run dev.`
      : `Firebase config is missing from this deployment. Add ${ENV} in Vercel and redeploy.`);
  }
  if (typeof rawValue !== 'string') {
    return invalid('not-json', `${ENV} must be a string containing one line of JSON.`);
  }

  const text = rawValue.replace(/^\uFEFF/, '').trim();
  if (!text) {
    return missing('empty', dev
      ? `${ENV} in .env.local is empty. Paste your Firebase Web app config as one line of JSON and restart npm run dev.`
      : `${ENV} is empty in this deployment. Paste the one-line Firebase Web config JSON as its value in Vercel and redeploy.`);
  }

  const secretsInText = findSecretMarkers(text);
  if (secretsInText.length) return secretResult(secretsInText, dev);

  if (/^(['"`])[\s\S]*\1$/.test(text)) {
    return invalid('wrapped-in-quotes', `${ENV} is wrapped in extra quotes. Remove the quotes around the whole value so it starts with { and ends with }.`);
  }
  if (/^(?:export\s+)?(?:const|let|var)\s+[\w$]+\s*=/.test(text) || /^[\w$.]+\s*=\s*\{/.test(text)) {
    return invalid('js-assignment', `${ENV} must contain only the JSON object, not JavaScript such as "const firebaseConfig = …;". Keep just the {…} part.`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    if (text.endsWith(';') && isJson(text.slice(0, -1))) {
      return invalid('trailing-semicolon', `${ENV} ends with a semicolon. Remove the trailing ";" so the value is plain JSON.`);
    }
    if (/^\{\s*[A-Za-z_$][\w$]*\s*:/.test(text) || /^\{\s*'/.test(text)) {
      return invalid('js-object-literal', `${ENV} looks like a JavaScript object, not JSON. Every key and string value needs double quotes, e.g. {"apiKey":"…","authDomain":"…"}.`);
    }
    return invalid('not-json', `${ENV} is not valid JSON. Paste the Firebase Web app config as a single line of JSON: {"apiKey":"…","authDomain":"…","projectId":"…","appId":"…"}.`);
  }

  if (typeof parsed === 'string') {
    return invalid('wrapped-in-quotes', `${ENV} is wrapped in extra quotes. Remove the quotes around the whole value so it starts with { and ends with }.`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return invalid('not-object', `${ENV} must be a JSON object such as {"apiKey":"…"}, not a string, number, list or null.`);
  }

  return validateConfigObject(parsed, { dev, source: 'json' });
}

/**
 * Validates a parsed config object. Shared by the one-line JSON path and the per-field
 * variable path; `source` only changes which variable names the messages point at.
 */
function validateConfigObject(parsed, { dev, source }) {
  const fromVars = source === 'env-vars';
  const invalid = (code, message, extra = {}) => ({
    status: 'invalid', code, message, hint: invalidHint(dev), config: null, missingFields: [], source, ...extra,
  });
  const nameOf = (field) => (fromVars ? FIREBASE_ENV_VARS[field] : field);

  const secretsInValue = findSecretMarkers(parsed);
  if (secretsInValue.length) return { ...secretResult(secretsInValue, dev, fromVars ? 'The VITE_FIREBASE_* variables contain' : undefined), source };

  const missingFields = REQUIRED_FIREBASE_FIELDS.filter((field) => !isNonEmptyString(parsed[field]));
  if (missingFields.length) {
    const message = fromVars
      ? `Missing required Firebase variable(s): ${missingFields.map(nameOf).join(', ')}. Copy every value from Firebase Console → Project settings → Your apps → SDK setup and configuration.`
      : `${ENV} is missing required field(s): ${missingFields.join(', ')}. Copy the complete Firebase Web app config from Firebase Console → Project settings → Your apps.`;
    return invalid('missing-fields', message, { missingFields });
  }

  const config = { ...parsed };
  for (const field of REQUIRED_FIREBASE_FIELDS) config[field] = parsed[field].trim();

  const placeholders = REQUIRED_FIREBASE_FIELDS.filter((field) => isPlaceholder(config[field]));
  if (placeholders.length) {
    const where = fromVars ? placeholders.map(nameOf).join(', ') : placeholders.join(', ');
    return invalid('placeholder-values', `${fromVars ? 'Firebase variables' : ENV} still contain${fromVars ? '' : 's'} placeholder text in: ${where}. Replace it with the real values from Firebase Console → Project settings → Your apps.`);
  }
  if (!AUTH_DOMAIN_PATTERN.test(config.authDomain)) {
    return invalid('bad-auth-domain', `${fromVars ? FIREBASE_ENV_VARS.authDomain : `${ENV} authDomain`} must be a bare host name such as your-project.firebaseapp.com, with no https:// and no path.`);
  }

  return { status: 'ok', code: 'ok', message: '', hint: '', config, missingFields: [], source };
}

function wrappedInQuotes(value) {
  return value.length >= 2 && /^(['"`])[\s\S]*\1$/.test(value);
}

/**
 * Builds the config from one variable per field (VITE_FIREBASE_API_KEY, …).
 * Returns null when none of them has a value, so the caller can fall back to the legacy JSON variable.
 */
function parseFieldVariables(env, { dev }) {
  const values = {};
  for (const [field, name] of Object.entries(FIREBASE_ENV_VARS)) {
    const raw = env[name];
    if (typeof raw !== 'string') continue;
    const value = raw.replace(/^\uFEFF/, '').trim();
    if (value) values[field] = value;
  }
  if (!Object.keys(values).length) return null;

  const fail = (code, message, hint) => ({
    status: 'invalid', code, message, hint: hint ?? invalidHint(dev), config: null, missingFields: [], source: 'env-vars',
  });

  const secretLabels = new Set();
  for (const value of Object.values(values)) for (const label of findSecretMarkers(value)) secretLabels.add(label);
  if (secretLabels.size) return { ...secretResult([...secretLabels], dev, 'The VITE_FIREBASE_* variables contain'), source: 'env-vars' };

  const quoted = Object.keys(values).filter((field) => wrappedInQuotes(values[field]));
  if (quoted.length) {
    return fail('wrapped-in-quotes', `${quoted.map((field) => FIREBASE_ENV_VARS[field]).join(', ')} ${quoted.length > 1 ? 'are' : 'is'} wrapped in extra quotes. Paste the bare value without quotes.`);
  }

  return validateConfigObject(values, { dev, source: 'env-vars' });
}

/**
 * Resolves the Firebase Web config from an env object (`import.meta.env` in the browser, the merged
 * .env files + process.env at build time).
 *
 * Order: the per-field variables (VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, …) win as soon as
 * any of them has a value; otherwise the legacy one-line JSON VITE_FIREBASE_CONFIG is used; if neither
 * is set the result is `missing`. The result has the same shape as parseFirebaseConfig, plus
 * `source: 'env-vars' | 'json' | 'none'`.
 */
export function resolveFirebaseConfig(env, { dev = false } = {}) {
  const source = env && typeof env === 'object' ? env : {};
  const fromFields = parseFieldVariables(source, { dev });
  if (fromFields) return fromFields;

  if (source[ENV] === undefined || source[ENV] === null) {
    return {
      status: 'missing',
      code: 'missing',
      message: dev
        ? `Firebase config is missing. Add the ${FIREBASE_ENV_VARS.apiKey}, ${FIREBASE_ENV_VARS.authDomain}, ${FIREBASE_ENV_VARS.projectId} and ${FIREBASE_ENV_VARS.appId} variables (and the other VITE_FIREBASE_* ones) to .env.local and restart npm run dev.`
        : 'Firebase config is missing from this deployment. Add the VITE_FIREBASE_* variables (VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID …) in Vercel and redeploy.',
      hint: missingHint(dev),
      config: null,
      missingFields: [...REQUIRED_FIREBASE_FIELDS],
      source: 'none',
    };
  }
  return parseFirebaseConfig(source[ENV], { dev });
}

function isJson(text) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function secretResult(labels, dev, subject = `${ENV} contains`) {
  return {
    status: 'invalid',
    code: 'secret-detected',
    message: `${subject} credential-like data (${labels.join(', ')}). VITE_* values are embedded in the public browser bundle, so a service-account key or OAuth client secret must never be stored here. Remove it, keep only the Firebase Web app config, and rotate anything that was pasted.`,
    hint: dev
      ? 'Remove the secret from .env.local, and rotate the credential if it was ever committed or shared.'
      : 'Rotate the exposed credential (Google Cloud Console → IAM & Admin → Service Accounts, or APIs & Services → Credentials), then redeploy with only the Firebase Web app config.',
    config: null,
    missingFields: [],
  };
}

/** The two public identifiers that are safe to show in diagnostics (never the apiKey). */
export function summarizeFirebaseConfig(config) {
  return {
    projectId: typeof config?.projectId === 'string' ? config.projectId : '',
    authDomain: typeof config?.authDomain === 'string' ? config.authDomain : '',
  };
}
