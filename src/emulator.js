/**
 * Firebase Emulator Suite wiring, in a pure module.
 *
 * The emulators let you develop rooms, profiles and friends against a local Firestore and a local
 * Auth, with no real project and no rules published anywhere. They are **opt-in and development
 * only**: nothing here can send a deployed site to `localhost`, because the flag is ignored unless
 * the build itself is a dev build (Vite's `import.meta.env.DEV`).
 *
 * Same shape as src/firebase-config.js: pure functions over an env object, so the browser bundle,
 * the Vite build check and the node:test suite all agree on "is the emulator on".
 */

/** Variable names the app reads to find the emulators. All are optional. */
export const EMULATOR_ENV_VARS = Object.freeze({
  enabled: 'VITE_USE_FIREBASE_EMULATOR',
  host: 'VITE_FIREBASE_EMULATOR_HOST',
  firestorePort: 'VITE_FIRESTORE_EMULATOR_PORT',
  authPort: 'VITE_FIREBASE_AUTH_EMULATOR_PORT',
});

/** Every variable name in this module, so the build-time env check can tell them apart from typos. */
export const EMULATOR_ENV_NAMES = Object.freeze(Object.values(EMULATOR_ENV_VARS));

export const EMULATOR_DEFAULTS = Object.freeze({
  host: '127.0.0.1',
  firestorePort: 8080,
  authPort: 9099,
});

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

function port(value, fallback) {
  const parsed = Number(String(value ?? '').trim());
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

function host(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed || EMULATOR_DEFAULTS.host;
}

/**
 * Decides whether this build talks to the emulators, and where they are.
 *
 * @param {Record<string, string | undefined>} env  the Vite env object (`import.meta.env`)
 * @param {{ dev?: boolean }} [options] `dev` must be true for the emulator to be allowed.
 * @returns {{
 *   enabled: boolean,
 *   reason: 'ok' | 'off' | 'production-build',
 *   host: string,
 *   firestorePort: number,
 *   authPort: number,
 *   authUrl: string,
 * }}
 */
export function resolveEmulatorConfig(env = {}, { dev = true } = {}) {
  const hostName = host(env[EMULATOR_ENV_VARS.host]);
  const firestorePort = port(env[EMULATOR_ENV_VARS.firestorePort], EMULATOR_DEFAULTS.firestorePort);
  const authPort = port(env[EMULATOR_ENV_VARS.authPort], EMULATOR_DEFAULTS.authPort);
  const base = { host: hostName, firestorePort, authPort, authUrl: `http://${hostName}:${authPort}` };

  if (!TRUTHY.has(String(env[EMULATOR_ENV_VARS.enabled] ?? '').trim().toLowerCase())) {
    return { ...base, enabled: false, reason: 'off' };
  }
  if (!dev) {
    // A production bundle that pointed at 127.0.0.1 would simply be broken, and silently so.
    return { ...base, enabled: false, reason: 'production-build' };
  }
  return { ...base, enabled: true, reason: 'ok' };
}

/** One line for the dev-server console. Never prints a config value, only the target. */
export function describeEmulatorConfig(config = resolveEmulatorConfig()) {
  if (config.enabled) return `Using the Firebase emulators at ${config.host}:${config.firestorePort} (auth ${config.authPort}).`;
  if (config.reason === 'production-build') return 'VITE_USE_FIREBASE_EMULATOR is set, but this is not a dev build, so the emulator setting is ignored.';
  return 'Firebase emulators are off (set VITE_USE_FIREBASE_EMULATOR=1 in .env.local to use them).';
}
