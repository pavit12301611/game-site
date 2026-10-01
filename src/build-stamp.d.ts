/**
 * `__PSD_BUILD__` is injected by vite.config.js (`define`) at build time: which environment and
 * commit this bundle came from. It never carries Firebase config values.
 *
 * The declaration lives in a `.d.ts` file because a plain `.js` module cannot declare a global.
 */
declare const __PSD_BUILD__:
  | { mode: string; vercelEnv: string; commit: string; builtAt: string }
  | undefined;
