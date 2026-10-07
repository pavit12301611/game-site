/**
 * Browser origins allowed to call this project's Firebase callable functions.
 *
 * `onCall` enables CORS by default, but an explicit origin list documents this project's deployment
 * contract and avoids relying on the permissive default. Callable requests still require Firebase
 * Auth; CORS is not auth.
 */
export const CALLABLE_CORS_ORIGINS = [
  'https://psd-gaming.vercel.app',
  /^https:\/\/psd-gaming-[a-z0-9-]+\.vercel\.app$/,
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
];

/** @param {string} origin */
export function isCallableOriginAllowed(origin) {
  return CALLABLE_CORS_ORIGINS.some((allowed) => (
    typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
  ));
}
