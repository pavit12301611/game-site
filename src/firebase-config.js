/**
 * Firebase Web config parser and validator. Pure module: no SDK, no DOM.
 */

export const FIREBASE_CONFIG_ENV_NAME = 'VITE_FIREBASE_CONFIG';
export const REQUIRED_FIREBASE_FIELDS = Object.freeze(['apiKey', 'authDomain', 'projectId', 'appId']);

export const FIREBASE_ENV_VARS = Object.freeze({
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
  measurementId: 'VITE_FIREBASE_MEASUREMENT_ID',
});

export const FIREBASE_ENV_NAMES = Object.freeze([...Object.values(FIREBASE_ENV_VARS), FIREBASE_CONFIG_ENV_NAME]);

const SECRET_KEY_LABELS = new Map([
  ['privatekey', 'private_key'],
  ['privatekeyid', 'private_key_id'],
  ['clientemail', 'client_email'],
  ['clientsecret', 'client_secret'],
]);
const PEM_PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const GOOGLE_OAUTH_CLIENT_SECRET = /GOCSPX-[A-Za-z0-9_-]{8,}/;
const SERVICE_ACCOUNT_TYPE = /[\"']type[\"']\s*:\s*[\"']service_account[\"']/;

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

function isNonEmptyString(value) { return typeof value === 'string' && value.trim().length > 0; }
function isPlaceholder(value) { return PLACEHOLDER_PATTERNS.some(p => p.test(value)); }
function wrappedInQuotes(value) { return value.length >= 2 && /^(['\"`])[\s\S]*\1$/.test(value); }
function isJson(text) { try { JSON.parse(text); return true; } catch { return false; } }

function missingHint(dev) {
  return dev
    ? 'Copy .env.example to .env.local, fill in the VITE_FIREBASE_* values from your Firebase Web app config, then restart the dev server.'
    : 'In Vercel: Project → Settings → Environment Variables → add the VITE_FIREBASE_* variables, then redeploy.';
}

function invalidHint(dev) {
  return dev
    ? 'Fix the value(s) in .env.local and restart npm run dev.'
    : 'Fix the value(s) in Vercel → Project → Settings → Environment Variables, then redeploy.';
}

function secretResult(labels, dev, subject = `${FIREBASE_CONFIG_ENV_NAME} contains`) {
  return {
    status: 'invalid',
    code: 'secret-detected',
    message: `${subject} credential-like data (${labels.join(', ')}). VITE_* values are embedded in the public browser bundle. Remove it and rotate anything pasted.`,
    hint: dev ? 'Remove the secret from .env.local.' : 'Rotate the exposed credential, then redeploy with only the Firebase Web app config.',
    config: null,
    missingFields: [],
  };
}

function validateConfigObject(parsed, { dev, source }) {
  const fromVars = source === 'env-vars';
  const invalid = (code, message, extra = {}) => ({
    status: 'invalid', code, message, hint: invalidHint(dev), config: null, missingFields: [], source, ...extra,
  });
  const nameOf = (field) => (fromVars ? FIREBASE_ENV_VARS[field] : field);

  const secretsInValue = findSecretMarkers(parsed);
  if (secretsInValue.length) return { ...secretResult(secretsInValue, dev, fromVars ? 'The VITE_FIREBASE_* variables contain' : undefined), source };

  const missingFields = REQUIRED_FIREBASE_FIELDS.filter(field => !isNonEmptyString(parsed[field]));
  if (missingFields.length) {
    const message = fromVars
      ? `Missing required Firebase variable(s): ${missingFields.map(nameOf).join(', ')}.`
      : `${FIREBASE_CONFIG_ENV_NAME} is missing required field(s): ${missingFields.join(', ')}.`;
    return invalid('missing-fields', message, { missingFields });
  }

  const config = { ...parsed };
  for (const field of REQUIRED_FIREBASE_FIELDS) config[field] = /** @type {string} */ (parsed[field]).trim();

  const placeholders = REQUIRED_FIREBASE_FIELDS.filter(field => isPlaceholder(/** @type {string} */ (config[field])));
  if (placeholders.length) {
    const where = fromVars ? placeholders.map(nameOf).join(', ') : placeholders.join(', ');
    return invalid('placeholder-values', `Still contain placeholder text in: ${where}. Replace with real values.`);
  }

  if (!AUTH_DOMAIN_PATTERN.test(/** @type {string} */ (config.authDomain))) {
    return invalid('bad-auth-domain', `${nameOf('authDomain')} must be a bare host name such as your-project.firebaseapp.com.`);
  }

  return { status: 'ok', code: 'ok', message: '', hint: '', config, missingFields: [], source };
}

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

  const quoted = Object.keys(values).filter(field => wrappedInQuotes(values[field]));
  if (quoted.length) return fail('wrapped-in-quotes', `${quoted.map(field => FIREBASE_ENV_VARS[field]).join(', ')} wrapped in extra quotes.`);

  return validateConfigObject(values, { dev, source: 'env-vars' });
}

function parseJsonConfig(rawValue, { dev = false } = {}) {
  const missing = (code, message) => ({ status: 'missing', code, message, hint: missingHint(dev), config: null, missingFields: [...REQUIRED_FIREBASE_FIELDS] });
  const invalid = (code, message) => ({ status: 'invalid', code, message, hint: invalidHint(dev), config: null, missingFields: [] });

  if (rawValue === undefined || rawValue === null) return missing('missing', dev ? `Firebase config is missing. Add ${FIREBASE_CONFIG_ENV_NAME} to .env.local.` : `Firebase config is missing from this deployment.`);
  if (typeof rawValue !== 'string') return invalid('not-json', `${FIREBASE_CONFIG_ENV_NAME} must be a string containing JSON.`);

  const text = rawValue.replace(/^\uFEFF/, '').trim();
  if (!text) return missing('empty', `${FIREBASE_CONFIG_ENV_NAME} is empty.`);

  const secrets = findSecretMarkers(text);
  if (secrets.length) return secretResult(secrets, dev);

  if (/^(['\"`])[\s\S]*\1$/.test(text)) return invalid('wrapped-in-quotes', `${FIREBASE_CONFIG_ENV_NAME} is wrapped in extra quotes.`);

  let parsed;
  try { parsed = JSON.parse(text); } catch {
    if (text.endsWith(';') && isJson(text.slice(0, -1))) return invalid('trailing-semicolon', `${FIREBASE_CONFIG_ENV_NAME} ends with a semicolon.`);
    if (/^\{\s*[A-Za-z_$][\w$]*\s*:/.test(text)) return invalid('js-object-literal', `${FIREBASE_CONFIG_ENV_NAME} looks like a JS object, not JSON.`);
    return invalid('not-json', `${FIREBASE_CONFIG_ENV_NAME} is not valid JSON.`);
  }

  if (typeof parsed === 'string') return invalid('wrapped-in-quotes', `${FIREBASE_CONFIG_ENV_NAME} is wrapped in extra quotes.`);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return invalid('not-object', `${FIREBASE_CONFIG_ENV_NAME} must be a JSON object.`);

  return validateConfigObject(parsed, { dev, source: 'json' });
}

export function parseFirebaseConfig(rawValue, options = {}) {
  return { ...parseJsonConfig(rawValue, options), source: 'json' };
}

export function resolveFirebaseConfig(env, { dev = false } = {}) {
  const source = env && typeof env === 'object' ? env : {};
  const fromFields = parseFieldVariables(source, { dev });
  if (fromFields) return fromFields;

  if (source[FIREBASE_CONFIG_ENV_NAME] === undefined || source[FIREBASE_CONFIG_ENV_NAME] === null) {
    return {
      status: 'missing', code: 'missing',
      message: dev ? `Firebase config is missing. Add the VITE_FIREBASE_* variables to .env.local.` : 'Firebase config is missing from this deployment. Add the VITE_FIREBASE_* variables in Vercel and redeploy.',
      hint: missingHint(dev), config: null, missingFields: [...REQUIRED_FIREBASE_FIELDS], source: 'none',
    };
  }
  return parseFirebaseConfig(source[FIREBASE_CONFIG_ENV_NAME], { dev });
}

export function summarizeFirebaseConfig(config) {
  return {
    projectId: typeof config?.projectId === 'string' ? config.projectId : '',
    authDomain: typeof config?.authDomain === 'string' ? config.authDomain : '',
  };
}