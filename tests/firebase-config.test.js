import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FIREBASE_CONFIG_ENV_NAME,
  FIREBASE_ENV_VARS,
  REQUIRED_FIREBASE_FIELDS,
  findSecretMarkers,
  parseFirebaseConfig,
  resolveFirebaseConfig,
  summarizeFirebaseConfig,
} from '../src/firebase-config.js';

const VALID = {
  apiKey: 'test-api-key-123',
  authDomain: 'psd-arcade-test.firebaseapp.com',
  projectId: 'psd-arcade-test',
  storageBucket: 'psd-arcade-test.appspot.com',
  messagingSenderId: '123456789012',
  appId: '1:123456789012:web:0a1b2c3d4e5f',
};
const FIELD_ENV = Object.fromEntries(Object.entries(FIREBASE_ENV_VARS).filter(([field]) => field in VALID).map(([field, name]) => [name, VALID[field]]));
const line = (value) => JSON.stringify(value);
// Built from pieces so this file never contains a literal secret-shaped string.
const PEM_HEADER = `-----BEGIN ${'PRIVATE'} KEY-----`;
const OAUTH_SECRET = `${'GOC'}${'SPX'}-FakeSecretValue1234567890`;
// A value shaped like a real browser API key ("AIza" + 35 characters), assembled so the repo never contains one.
const API_KEY_SHAPE = `${'AI'}${'za'}${'Sy'}-NotARealKey_fixture_0123456789ab`;

test('the exact documented format is accepted: one line of raw JSON', () => {
  const result = parseFirebaseConfig(line(VALID));
  assert.equal(result.status, 'ok');
  assert.equal(result.code, 'ok');
  assert.equal(result.message, '');
  assert.deepEqual(result.config, VALID);
  assert.deepEqual(result.missingFields, []);
});

test('surrounding whitespace, a BOM, pretty printing and extra public fields are tolerated', () => {
  const pretty = `\uFEFF\n  ${JSON.stringify({ ...VALID, measurementId: 'G-TEST123' }, null, 2)}\n`;
  const result = parseFirebaseConfig(pretty);
  assert.equal(result.status, 'ok');
  assert.equal(result.config.measurementId, 'G-TEST123');
  const padded = parseFirebaseConfig(line({ ...VALID, apiKey: '  test-api-key-123\n' }));
  assert.equal(padded.status, 'ok');
  assert.equal(padded.config.apiKey, 'test-api-key-123', 'required string fields are trimmed');
});

test('a missing variable is "missing", with the exact deployment message', () => {
  for (const raw of [undefined, null]) {
    const result = parseFirebaseConfig(raw);
    assert.equal(result.status, 'missing');
    assert.equal(result.code, 'missing');
    assert.equal(result.config, null);
    assert.equal(result.message, 'Firebase config is missing from this deployment. Add VITE_FIREBASE_CONFIG in Vercel and redeploy.');
    assert.match(result.hint, /Vercel/);
    assert.match(result.hint, /redeploy/);
    assert.deepEqual(result.missingFields, [...REQUIRED_FIREBASE_FIELDS]);
  }
});

test('in development the same problem points at .env.local instead of Vercel', () => {
  const result = parseFirebaseConfig(undefined, { dev: true });
  assert.equal(result.status, 'missing');
  assert.match(result.message, /\.env\.local/);
  assert.doesNotMatch(result.message, /Vercel/);
  assert.match(result.hint, /\.env\.local/);
  const invalid = parseFirebaseConfig('not json', { dev: true });
  assert.match(invalid.hint, /\.env\.local/);
});

test('an empty or whitespace-only variable is reported as empty, not as a parse error', () => {
  for (const raw of ['', '   ', '\n\t']) {
    const result = parseFirebaseConfig(raw);
    assert.equal(result.status, 'missing');
    assert.equal(result.code, 'empty');
    assert.match(result.message, /empty/);
    assert.match(result.message, /Vercel/);
  }
});

test('extra wrapping quotes around the value are called out', () => {
  const inner = line(VALID);
  for (const raw of [`'${inner}'`, `"${inner}"`, `\`${inner}\``, JSON.stringify(inner)]) {
    const result = parseFirebaseConfig(raw);
    assert.equal(result.status, 'invalid', raw.slice(0, 20));
    assert.equal(result.code, 'wrapped-in-quotes', raw.slice(0, 20));
    assert.match(result.message, /extra quotes/);
  }
});

test('JavaScript pasted instead of JSON is called out', () => {
  const body = line(VALID);
  for (const raw of [
    `const firebaseConfig = ${body};`,
    `export const firebaseConfig = ${body}`,
    `let cfg = ${body}`,
    `firebaseConfig = ${body}`,
    `window.firebaseConfig = ${body}`,
  ]) {
    const result = parseFirebaseConfig(raw);
    assert.equal(result.code, 'js-assignment', raw.slice(0, 30));
    assert.match(result.message, /const firebaseConfig/);
  }
});

test('the JavaScript object shown by the Firebase console (unquoted keys) is explained, not silently accepted', () => {
  const consoleSnippet = '{\n  apiKey: "test-api-key-123",\n  authDomain: "psd-arcade-test.firebaseapp.com",\n  projectId: "psd-arcade-test",\n  appId: "1:1:web:1"\n}';
  const result = parseFirebaseConfig(consoleSnippet);
  assert.equal(result.status, 'invalid');
  assert.equal(result.code, 'js-object-literal');
  assert.match(result.message, /double quotes/);
  assert.equal(parseFirebaseConfig("{'apiKey':'a'}").code, 'js-object-literal');
  assert.equal(parseFirebaseConfig(`${line(VALID)};`).code, 'trailing-semicolon');
});

test('broken JSON is reported without echoing any of the value', () => {
  const result = parseFirebaseConfig('{"apiKey":"SENTINEL-do-not-echo"');
  assert.equal(result.status, 'invalid');
  assert.equal(result.code, 'not-json');
  assert.doesNotMatch(`${result.message} ${result.hint}`, /SENTINEL/);
});

test('JSON that is not an object is rejected', () => {
  for (const raw of ['[]', '[{"apiKey":"a"}]', '123', 'true', 'null']) {
    const result = parseFirebaseConfig(raw);
    assert.equal(result.status, 'invalid', raw);
    assert.equal(result.code, 'not-object', raw);
  }
  assert.equal(parseFirebaseConfig(42).status, 'invalid');
});

test('apiKey, authDomain, projectId and appId are all required and must be non-empty strings', () => {
  for (const field of REQUIRED_FIREBASE_FIELDS) {
    const withoutField = { ...VALID };
    delete withoutField[field];
    for (const broken of [withoutField, { ...VALID, [field]: '' }, { ...VALID, [field]: '   ' }, { ...VALID, [field]: 12345 }, { ...VALID, [field]: null }]) {
      const result = parseFirebaseConfig(line(broken));
      assert.equal(result.status, 'invalid', field);
      assert.equal(result.code, 'missing-fields', field);
      assert.deepEqual(result.missingFields, [field]);
      assert.match(result.message, new RegExp(`missing required field\\(s\\): ${field}\\.`));
      assert.equal(result.config, null);
    }
  }
  const several = parseFirebaseConfig('{"projectId":"p"}');
  assert.deepEqual(several.missingFields, ['apiKey', 'authDomain', 'appId']);
});

test('storageBucket and messagingSenderId are optional', () => {
  const minimal = {
    apiKey: VALID.apiKey,
    authDomain: VALID.authDomain,
    projectId: VALID.projectId,
    appId: VALID.appId,
  };
  assert.equal(parseFirebaseConfig(line(minimal)).status, 'ok');
});

test('placeholder text is never accepted as a real config', () => {
  for (const placeholder of ['...', 'AIza...', '<API_KEY>', '${FIREBASE_API_KEY}', 'YOUR_API_KEY', 'your-project', 'your-project.firebaseapp.com', 'your-project-id']) {
    const result = parseFirebaseConfig(line({ ...VALID, apiKey: placeholder }));
    assert.equal(result.code, 'placeholder-values', placeholder);
    assert.match(result.message, /placeholder text in: apiKey\./, placeholder);
  }
  const all = parseFirebaseConfig(line({ apiKey: 'AIza...', authDomain: 'your-project.firebaseapp.com', projectId: 'your-project', appId: '1:123:web:...' }));
  assert.match(all.message, /apiKey, authDomain, projectId, appId/);
});

test('real-looking values are not mistaken for placeholders', () => {
  for (const overrides of [
    { projectId: 'your-arcade-2026' },
    { projectId: 'yourapp-prod', authDomain: 'yourapp-prod.firebaseapp.com' },
    { apiKey: API_KEY_SHAPE },
    { authDomain: 'auth.example.com' },
    { authDomain: 'localhost:9099' },
    { authDomain: 'PSD-Arcade-Test.firebaseapp.com' },
  ]) {
    assert.equal(parseFirebaseConfig(line({ ...VALID, ...overrides })).status, 'ok', JSON.stringify(overrides));
  }
});

test('authDomain must be a bare host name', () => {
  for (const authDomain of ['https://psd-arcade-test.firebaseapp.com', 'psd-arcade-test.firebaseapp.com/', 'psd arcade.firebaseapp.com', 'a.com/__/auth']) {
    const result = parseFirebaseConfig(line({ ...VALID, authDomain }));
    assert.equal(result.code, 'bad-auth-domain', authDomain);
    assert.match(result.message, /bare host name/);
  }
});

test('secrets are refused, named by type, and never echoed', () => {
  const serviceAccount = line({
    type: 'service_account',
    project_id: 'psd-arcade-test',
    private_key_id: 'abc123',
    private_key: `${PEM_HEADER}\nSENTINEL-KEY-MATERIAL\n-----END ${'PRIVATE'} KEY-----\n`,
    client_email: 'firebase-adminsdk@psd-arcade-test.iam.gserviceaccount.com',
  });
  const cases = [
    serviceAccount,
    `'${serviceAccount}'`, // still a secret even when wrapped in quotes
    line({ ...VALID, private_key: 'SENTINEL-KEY-MATERIAL' }),
    line({ ...VALID, privateKey: 'SENTINEL-KEY-MATERIAL' }),
    line({ web: { client_id: 'x.apps.googleusercontent.com', client_secret: 'SENTINEL-KEY-MATERIAL' } }),
    line({ ...VALID, nested: { deeper: { client_secret: 'SENTINEL-KEY-MATERIAL' } } }),
    line({ ...VALID, type: 'service_account' }),
    line({ ...VALID, oauth: OAUTH_SECRET }),
  ];
  for (const raw of cases) {
    const result = parseFirebaseConfig(raw);
    assert.equal(result.status, 'invalid');
    assert.equal(result.code, 'secret-detected', raw.slice(0, 40));
    assert.equal(result.config, null);
    assert.match(result.message, /credential-like data/);
    assert.match(result.message, /public browser bundle/);
    assert.doesNotMatch(`${result.message} ${result.hint}`, /SENTINEL|FakeSecretValue|PRIVATE KEY-----|iam\.gserviceaccount/);
  }
});

test('an ordinary Firebase web config is not flagged as a secret', () => {
  assert.deepEqual(findSecretMarkers(line(VALID)), []);
  assert.deepEqual(findSecretMarkers(VALID), []);
  assert.deepEqual(findSecretMarkers({ ...VALID, measurementId: 'G-TEST123', clientId: 'public-id' }), []);
  assert.deepEqual(findSecretMarkers({ private_key: 'x', nested: { clientSecret: 'y' } }).sort(), ['client_secret field', 'private_key field']);
});

test('only the public identifiers are summarized for diagnostics (never the API key)', () => {
  assert.deepEqual(summarizeFirebaseConfig(VALID), { projectId: 'psd-arcade-test', authDomain: 'psd-arcade-test.firebaseapp.com' });
  assert.deepEqual(summarizeFirebaseConfig(null), { projectId: '', authDomain: '' });
});

test('no message or hint ever contains the raw value that was supplied', () => {
  const inputs = [
    `'${line({ ...VALID, apiKey: 'SENTINEL-1' })}'`,
    `const firebaseConfig = ${line({ ...VALID, apiKey: 'SENTINEL-2' })};`,
    `{ apiKey: "SENTINEL-3", projectId: "p" }`,
    `{"apiKey":"SENTINEL-4"`,
    line({ apiKey: 'SENTINEL-5' }),
    line({ ...VALID, apiKey: 'SENTINEL-6...' }),
    line({ ...VALID, apiKey: 'SENTINEL-7', authDomain: 'https://x.y' }),
    '[ "SENTINEL-8" ]',
  ];
  for (const raw of inputs) {
    const result = parseFirebaseConfig(raw);
    assert.equal(result.status, 'invalid', raw);
    assert.doesNotMatch(`${result.message} ${result.hint}`, /SENTINEL/, raw);
  }
});

function parseDotenv(text) {
  const env = {};
  for (const entry of text.split('\n')) {
    const match = entry.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

test('.env.example has one placeholder line per Firebase variable, and the placeholders are rejected until replaced', () => {
  const example = parseDotenv(readFileSync(new URL('../.env.example', import.meta.url), 'utf8'));
  for (const field of REQUIRED_FIREBASE_FIELDS) {
    assert.ok(FIREBASE_ENV_VARS[field] in example, `.env.example must contain ${FIREBASE_ENV_VARS[field]}=`);
  }
  for (const name of ['VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID']) assert.ok(name in example, name);
  assert.ok(!(FIREBASE_CONFIG_ENV_NAME in example), 'the legacy JSON variable stays commented out');
  assert.equal(resolveFirebaseConfig(example).code, 'placeholder-values', 'copying .env.example unchanged must not look configured');
  // ...and once a person fills in the required ones, exactly that shape works.
  const filled = { ...example, ...FIELD_ENV };
  assert.equal(resolveFirebaseConfig(filled).status, 'ok');
});

test('the README documents every VITE_FIREBASE_* variable and the legacy fallback', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  for (const name of Object.values(FIREBASE_ENV_VARS)) assert.ok(readme.includes(name), `README mentions ${name}`);
  assert.ok(readme.includes(FIREBASE_CONFIG_ENV_NAME));
  const envBlock = readme.match(/```dotenv\n([\s\S]*?)```/)?.[1];
  assert.ok(envBlock, 'README needs an exact .env.local example');
  const example = parseDotenv(envBlock);
  for (const field of REQUIRED_FIREBASE_FIELDS) assert.ok(FIREBASE_ENV_VARS[field] in example, `README example has ${FIREBASE_ENV_VARS[field]}`);
  assert.equal(resolveFirebaseConfig(example).code, 'placeholder-values');
});

// ---- one environment variable per Firebase field (VITE_FIREBASE_API_KEY, …) ----

test('every Firebase field has its own VITE_FIREBASE_* variable name', () => {
  assert.deepEqual({ ...FIREBASE_ENV_VARS }, {
    apiKey: 'VITE_FIREBASE_API_KEY',
    authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
    projectId: 'VITE_FIREBASE_PROJECT_ID',
    storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
    messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
    appId: 'VITE_FIREBASE_APP_ID',
    measurementId: 'VITE_FIREBASE_MEASUREMENT_ID',
  });
});

test('separate variables build the same config as the one-line JSON', () => {
  const result = resolveFirebaseConfig(FIELD_ENV);
  assert.equal(result.status, 'ok');
  assert.equal(result.source, 'env-vars');
  assert.deepEqual(result.config, VALID);
  assert.deepEqual(summarizeFirebaseConfig(result.config), { projectId: 'psd-arcade-test', authDomain: 'psd-arcade-test.firebaseapp.com' });
});

test('optional variables may be absent or blank, and measurementId is passed through', () => {
  const minimal = resolveFirebaseConfig({
    VITE_FIREBASE_API_KEY: ' test-api-key-123 ',
    VITE_FIREBASE_AUTH_DOMAIN: VALID.authDomain,
    VITE_FIREBASE_PROJECT_ID: VALID.projectId,
    VITE_FIREBASE_APP_ID: VALID.appId,
    VITE_FIREBASE_STORAGE_BUCKET: '',
  });
  assert.equal(minimal.status, 'ok');
  assert.deepEqual(minimal.config, { apiKey: 'test-api-key-123', authDomain: VALID.authDomain, projectId: VALID.projectId, appId: VALID.appId });
  assert.equal(resolveFirebaseConfig({ ...FIELD_ENV, VITE_FIREBASE_MEASUREMENT_ID: 'G-TEST123' }).config.measurementId, 'G-TEST123');
});

test('nothing set at all is "missing" and names the variables to add', () => {
  for (const env of [{}, undefined, null, { VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_APP_ID: '   ' }]) {
    const result = resolveFirebaseConfig(env);
    assert.equal(result.status, 'missing');
    assert.equal(result.source, 'none');
    assert.match(result.message, /VITE_FIREBASE_API_KEY/);
    assert.match(result.message, /Vercel/);
  }
  assert.match(resolveFirebaseConfig({}, { dev: true }).message, /\.env\.local/);
});

test('a partly filled set names exactly the variables that are still missing', () => {
  const partial = { ...FIELD_ENV };
  delete partial.VITE_FIREBASE_APP_ID;
  delete partial.VITE_FIREBASE_AUTH_DOMAIN;
  const result = resolveFirebaseConfig(partial);
  assert.equal(result.status, 'invalid');
  assert.equal(result.code, 'missing-fields');
  assert.deepEqual(result.missingFields, ['authDomain', 'appId']);
  assert.match(result.message, /VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_APP_ID/);
  assert.doesNotMatch(result.message, /VITE_FIREBASE_API_KEY|VITE_FIREBASE_PROJECT_ID/);
});

test('placeholders, bad hosts and wrapping quotes are rejected per variable, without echoing values', () => {
  const placeholder = resolveFirebaseConfig({ ...FIELD_ENV, VITE_FIREBASE_API_KEY: 'YOUR_API_KEY' });
  assert.equal(placeholder.code, 'placeholder-values');
  assert.match(placeholder.message, /VITE_FIREBASE_API_KEY/);
  assert.doesNotMatch(placeholder.message, /YOUR_API_KEY/);
  assert.equal(resolveFirebaseConfig({ ...FIELD_ENV, VITE_FIREBASE_APP_ID: '1:123:web:...' }).code, 'placeholder-values');

  const host = resolveFirebaseConfig({ ...FIELD_ENV, VITE_FIREBASE_AUTH_DOMAIN: 'https://psd-arcade-test.firebaseapp.com/' });
  assert.equal(host.code, 'bad-auth-domain');
  assert.match(host.message, /VITE_FIREBASE_AUTH_DOMAIN/);

  const quoted = resolveFirebaseConfig({ ...FIELD_ENV, VITE_FIREBASE_API_KEY: '"SENTINEL-quoted-key"' });
  assert.equal(quoted.code, 'wrapped-in-quotes');
  assert.match(quoted.message, /VITE_FIREBASE_API_KEY/);
  assert.doesNotMatch(quoted.message, /SENTINEL/);
});

test('a secret in any per-field variable is refused and never echoed', () => {
  for (const secret of [PEM_HEADER, OAUTH_SECRET]) {
    const result = resolveFirebaseConfig({ ...FIELD_ENV, VITE_FIREBASE_API_KEY: `${secret}SENTINEL` });
    assert.equal(result.status, 'invalid');
    assert.equal(result.code, 'secret-detected');
    assert.equal(result.config, null);
    assert.match(result.message, /VITE_FIREBASE_\* variables contain credential-like data/);
    assert.doesNotMatch(`${result.message} ${result.hint}`, /SENTINEL|BEGIN|GOCSPX/);
  }
});

test('the legacy one-line VITE_FIREBASE_CONFIG still works when no per-field variable is set, and loses to them otherwise', () => {
  const legacy = resolveFirebaseConfig({ VITE_FIREBASE_CONFIG: line(VALID) });
  assert.equal(legacy.status, 'ok');
  assert.equal(legacy.source, 'json');
  assert.equal(resolveFirebaseConfig({ VITE_FIREBASE_CONFIG: 'nope' }).code, 'not-json');
  assert.equal(resolveFirebaseConfig({ VITE_FIREBASE_CONFIG: '' }).code, 'empty');
  const both = resolveFirebaseConfig({ ...FIELD_ENV, VITE_FIREBASE_PROJECT_ID: 'from-fields', VITE_FIREBASE_CONFIG: line(VALID) });
  assert.equal(both.source, 'env-vars');
  assert.equal(both.config.projectId, 'from-fields');
});
