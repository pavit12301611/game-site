/**
 * Vite plugin that checks Firebase environment variables at build time.
 */

export function firebaseEnvCheckPlugin() {
  return {
    name: 'firebase-env-check',
    configResolved(config) {
      const isBuild = config.command === 'build';
      if (!isBuild) return;

      const env = config.env || {};
      const vars = Object.keys(env).filter(k => k.startsWith('VITE_FIREBASE_'));
      const requireConfig = process.env.REQUIRE_FIREBASE_CONFIG === '1';

      if (vars.length === 0) {
        const msg = '[psd-gaming] ⚠ The Firebase config (VITE_FIREBASE_* variables) is not set for this build.';
        if (requireConfig) { console.error(msg); process.exit(1); }
        else console.warn(msg);
        return;
      }

      console.log(`[psd-gaming] ✔ The VITE_FIREBASE_* variables are set.`);
    },
  };
}