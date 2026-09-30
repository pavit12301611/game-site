import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FIREBASE_CONFIG_ENV_NAME,
  REQUIRED_FIREBASE_FIELDS,
  findSecretMarkers,
  parseFirebaseConfig,
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
  const { storageBucket, messagingSenderId, ...minimal } = VALID;
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

test('.env.example documents the exact one-line format, and its placeholders are rejected until replaced', () => {
  const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  const envLine = example.split('\n').find((entry) => entry.startsWith(`${FIREBASE_CONFIG_ENV_NAME}=`));
  assert.ok(envLine, `.env.example must contain a ${FIREBASE_CONFIG_ENV_NAME}= line`);
  const value = envLine.slice(FIREBASE_CONFIG_ENV_NAME.length + 1);
  const sample = JSON.parse(value);
  for (const field of REQUIRED_FIREBASE_FIELDS) assert.ok(field in sample, `.env.example documents ${field}`);
  assert.ok('storageBucket' in sample && 'messagingSenderId' in sample);
  assert.equal(parseFirebaseConfig(value).code, 'placeholder-values', 'copying .env.example unchanged must not look configured');
  // ...and once a person fills it in, exactly that shape works.
  assert.equal(parseFirebaseConfig(line({ ...sample, ...VALID })).status, 'ok');
});

test('the README documents one consistent one-line JSON for .env.local, the converted console snippet and the Vercel value', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const envValue = readme.split('\n').find((entry) => entry.startsWith(`${FIREBASE_CONFIG_ENV_NAME}=`))?.slice(FIREBASE_CONFIG_ENV_NAME.length + 1);
  assert.ok(envValue, 'README needs an exact .env.local example line');
  const jsonBlock = readme.match(/```json\n\s*(\{.*\})\n\s*```/)?.[1];
  const vercelBlock = readme.match(/```text\n\s*(\{.*\})\n\s*```/)?.[1];
  assert.equal(jsonBlock, envValue, 'step-1 JSON block matches the .env.local example');
  assert.equal(vercelBlock, envValue, 'Vercel value example matches the .env.local example');
  const example = JSON.parse(envValue);
  for (const field of REQUIRED_FIREBASE_FIELDS) assert.ok(typeof example[field] === 'string', `README example has ${field}`);
  // copied unchanged it is rejected as placeholders; with real values it is exactly what the parser accepts
  assert.equal(parseFirebaseConfig(envValue).code, 'placeholder-values');
  assert.equal(parseFirebaseConfig(line({ ...example, apiKey: 'real-key-123', authDomain: 'my-arcade.firebaseapp.com', projectId: 'my-arcade' })).status, 'ok');
});
