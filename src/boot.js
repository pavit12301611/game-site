/**
 * Start-up. The one rule here: the page is always drawn.
 *
 * In local practice mode there is nothing to wait for, so the first paint happens at once. With
 * Firebase configured the app first asks Firebase whether a Google sign-in redirect just finished
 * (so a returning player is not painted as signed out for a moment), then draws, and keeps
 * `state.user` in sync for the rest of the session.
 *
 * Nothing in that sequence may leave `#app` empty: a rejected promise, a collaborator that throws,
 * a Firebase API that misbehaves - the shell is still painted and the error goes to the console
 * (and, for the redirect, to the sign-in dialog). The production outage this guards against was a
 * ReferenceError in the Firebase branch that stopped `routeFromHash()` from ever running.
 *
 * Every piece is passed in rather than imported, so the jsdom tests can run the Firebase branch
 * with stand-ins; `src/app.js` is the only caller and wires the real modules.
 */

/**
 * @typedef {object} BootDeps
 * @property {boolean} firebaseReady  did Firebase start from a valid config?
 * @property {() => void} routeFromHash  paints the page for the current hash
 * @property {(onUser: (user: import('firebase/auth').User | null) => void) => unknown} watchAuth
 *   subscribes to sign-in state changes (`onAuthStateChanged` bound to the Auth instance)
 * @property {(user: import('firebase/auth').User | null) => Promise<void>} refreshAccount
 * @property {() => Promise<void>} processGoogleRedirect
 * @property {(error: unknown, context: { method: string }) => void} reportAuthError
 * @property {Pick<Console, 'error'>} [logger]  defaults to `console`
 */

/**
 * Starts the app and resolves once the first paint has happened. Never rejects because of the
 * Firebase branch; only a throw from `routeFromHash` itself can surface, and `render()` already
 * swaps in the recovery screen when drawing fails.
 *
 * @param {BootDeps} deps
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

  if (!firebaseReady) {
    draw();
    return Promise.resolve();
  }

  try {
    watchAuth((user) => {
      // `refreshAccount` is async; a failure in it must neither go unreported nor stop the app.
      Promise.resolve()
        .then(() => refreshAccount(user))
        .catch((error) => logger.error('[PSD-gaming] The account could not be refreshed:', error));
    });
  } catch (error) {
    logger.error('[PSD-gaming] Could not watch the sign-in state; continuing without it:', error);
  }

  /** @type {Promise<void>} */
  let redirect;
  try {
    redirect = Promise.resolve(processGoogleRedirect());
  } catch (error) {
    redirect = Promise.reject(error);
  }
  return redirect
    .catch((error) => reportAuthError(error, { method: 'google-redirect' }))
    .finally(draw);
}
