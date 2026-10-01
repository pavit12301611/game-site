/**
 * Build-time guard for the VITE_FIREBASE_* variables / VITE_FIREBASE_CONFIG (used by vite.config.js).
 *
 * Vite copies `VITE_*` variables into the JavaScript bundle while it builds. That has two
 * consequences this file turns into clear build-log messages:
 *
 *   1. A variable that is missing (or wrong) when the build runs is missing in the deployed site,
 *      no matter what is added to Vercel afterwards. Only a NEW deployment picks up a change.
 *      -> warn loudly in the build log (or fail the build with REQUIRE_FIREBASE_CONFIG=1).
 *
 *   2. Anything placed in a `VITE_*` variable becomes public. If it looks like a service-account
 *      key or an OAuth client secret, the build stops instead of publishing it.
 *      -> always a build error.
 *
 * The raw value is never printed; only the public projectId / authDomain are.
 */
import { loadEnv } from 'vite';
import { FIREBASE_CONFIG_ENV_NAME, FIREBASE_ENV_NAMES, resolveFirebaseConfig, summarizeFirebaseConfig } from '../src/firebase-config.js';
import { EMULATOR_ENV_NAMES } from '../src/emulator.js';

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
const PREFIX = '[psd-gaming]';

/** Names (never values) of other variables that look like a misnamed attempt, e.g. FIREBASE_API_KEY without VITE_. */
function findLookalikeNames(env) {
  const known = new Set([...FIREBASE_ENV_NAMES, ...EMULATOR_ENV_NAMES]);
  return Object.keys(env)
    .filter((name) => /firebase/i.test(name) && !known.has(name))
    .sort();
}

function describeTarget(env, command) {
  if (env.VERCEL_ENV) return `Vercel ${env.VERCEL_ENV}`;
  if (env.VERCEL) return 'Vercel';
  return command === 'serve' ? 'local dev server' : 'local build';
}

/**
 * Pure check: decides what to report for a given environment.
 *
 * @param {Record<string, string | undefined>} env  merged env (.env files + process.env)
 * @param {{ command?: 'build' | 'serve' }} [options]
 * @returns {{ level: 'ok' | 'warn' | 'error', fatal: boolean, lines: string[], errorMessage?: string }}
 *   `lines` are for the build log; `errorMessage` (only when `fatal`) is the one-line reason the build stops.
 */
export function checkFirebaseBuildEnv(env = {}, { command = 'build' } = {}) {
  const dev = command === 'serve';
  const target = describeTarget(env, command);
  const strict = TRUTHY.has(String(env.REQUIRE_FIREBASE_CONFIG ?? '').trim().toLowerCase());
  const parsed = resolveFirebaseConfig(env, { dev });

  if (parsed.status === 'ok') {
    const { projectId, authDomain } = summarizeFirebaseConfig(parsed.config);
    return {
      level: 'ok',
      fatal: false,
      lines: [`✔ ${parsed.source === 'env-vars' ? 'The VITE_FIREBASE_* variables are' : `${FIREBASE_CONFIG_ENV_NAME} is`} set for this ${target} (project "${projectId}", authDomain "${authDomain}"). Online mode will start Firebase in the browser.`],
    };
  }

  if (parsed.code === 'secret-detected') {
    return {
      level: 'error',
      fatal: true,
      lines: [
        `✖ Refusing to build (${target}): ${parsed.message}`,
        `  → ${parsed.hint}`,
      ],
      errorMessage: `Refusing to build (${target}): ${parsed.message}`,
    };
  }

  const subject = parsed.source === 'json' ? FIREBASE_CONFIG_ENV_NAME : 'The Firebase config (VITE_FIREBASE_* variables)';
  const headline = parsed.status === 'missing'
    ? `${subject} is not set for this ${target}.`
    : `${subject} is invalid for this ${target}: ${parsed.message}`;
  const lines = [
    `⚠ ${headline}`,
    '  The site will start in "Local practice mode": online rooms, accounts and friends stay disabled.',
    `  → ${parsed.hint}`,
  ];
  const lookalikes = parsed.status === 'missing' ? findLookalikeNames(env) : [];
  if (lookalikes.length) {
    lines.push(`  Found other Firebase-looking variable name(s): ${lookalikes.join(', ')}. The app only reads ${FIREBASE_ENV_NAMES.join(', ')}: the name must match exactly, in capitals, with the VITE_ prefix.`);
  }
  if (env.VERCEL_ENV === 'preview') {
    lines.push('  This is a Preview build: enable the variables for the Preview environment too, not only Production.');
  }
  if (!env.VERCEL && !dev) lines.push('  Building on your own machine? Put them in .env.local instead (copy .env.example).');
  if (strict) {
    return {
      level: 'error',
      fatal: true,
      lines: [...lines, '  REQUIRE_FIREBASE_CONFIG is set, so this is a build error.'],
      errorMessage: `${headline} REQUIRE_FIREBASE_CONFIG is set, so the build is stopped.`,
    };
  }
  if (!dev) lines.push('  Tip: set REQUIRE_FIREBASE_CONFIG=1 in the build environment to make a missing or invalid config fail the build.');
  return { level: 'warn', fatal: false, lines };
}

/** Vite plugin: runs the check once when a build or the dev server starts (not for `vite preview`). */
export function firebaseEnvCheckPlugin() {
  let resolved;
  return {
    name: 'psd-firebase-env-check',
    configResolved(config) {
      resolved = config;
    },
    buildStart() {
      // loadEnv with an empty prefix returns the .env files merged with process.env, which is
      // exactly what Vite itself reads VITE_* values from (plus REQUIRE_FIREBASE_CONFIG / VERCEL_*).
      const env = loadEnv(resolved.mode, resolved.envDir || resolved.root, '');
      const result = checkFirebaseBuildEnv(env, { command: resolved.command });
      const method = result.level === 'error' ? 'error' : result.level === 'warn' ? 'warn' : 'info';
      // Dev server: one warning line is enough (the browser console carries the detail).
      const lines = resolved.command === 'serve' && result.level === 'warn' ? result.lines.slice(0, 1) : result.lines;
      for (const line of lines) resolved.logger[method](`${PREFIX} ${line}`);
      if (result.fatal) this.error(result.errorMessage);
    },
  };
}
