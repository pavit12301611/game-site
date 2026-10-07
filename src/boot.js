/**
 * Start-up sequence. The page is always drawn — nothing may leave #app empty.
 */

/**
 * @param {{
 *   firebaseReady: boolean,
 *   routeFromHash: () => void,
 *   watchAuth: (onUser: (user: any) => void) => unknown,
 *   refreshAccount: (user: any) => Promise<void>,
 *   processGoogleRedirect: () => Promise<void>,
 *   reportAuthError: (error: unknown, ctx: { method: string }) => void,
 *   logger?: Pick<Console, 'error'>
 * }} deps
 * @returns {Promise<void>}
 */
export function boot({
  firebaseReady,
  routeFromHash,
  watchAuth,
  refreshAccount,
  processGoogleRedirect,
  reportAuthError,
  logger = console,
}) {
  let drawn = false;
  const draw = () => {
    if (drawn) return;
    drawn = true;
    routeFromHash();
  };

  if (!firebaseReady) { draw(); return Promise.resolve(); }

  try {
    watchAuth((user) => {
      Promise.resolve()
        .then(() => refreshAccount(user))
        .catch((error) => logger.error('[PSD-gaming] Account refresh failed:', error));
    });
  } catch (error) {
    logger.error('[PSD-gaming] Could not watch sign-in state:', error);
  }

  let redirect;
  try { redirect = Promise.resolve(processGoogleRedirect()); }
  catch (error) { redirect = Promise.reject(error); }

  return redirect
    .catch((error) => reportAuthError(error, { method: 'google-redirect' }))
    .finally(draw);
}