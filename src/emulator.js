/**
 * Firebase Emulator Suite configuration.
 * Ignored by production builds.
 */

export function resolveEmulatorConfig(env, { dev = false } = {}) {
  const enabled = dev && String(env.VITE_USE_FIREBASE_EMULATOR) === '1';
  const host = String(env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1');
  const firestorePort = Number(env.VITE_FIRESTORE_EMULATOR_PORT) || 8080;
  const authPort = Number(env.VITE_FIREBASE_AUTH_EMULATOR_PORT) || 9099;
  return {
    enabled,
    host,
    firestorePort,
    authPort,
    authUrl: `http://${host}:${authPort}`,
  };
}

export function describeEmulatorConfig(config) {
  return `Emulator mode: Firestore on ${config.host}:${config.firestorePort}, Auth on ${config.host}:${config.authPort}`;
}