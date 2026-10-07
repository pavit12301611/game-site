/**
 * Firebase Cloud Functions — DISABLED.
 *
 * The callable backend that used to live here has been migrated to Vercel serverless functions.
 * The routes now live in `api/` (one file per action, e.g. `api/createRoom.js`) and share their
 * wiring through `api/_backend.js`, which verifies the caller's Firebase ID token and runs the very
 * same handlers from `functions/src/handlers.js`.
 *
 * What moved where:
 *
 *   - the `onCall` wrappers (`claimUsername`, `lookupUser`, the social calls, the room lifecycle,
 *     moves, chat, blocks, reports, reviews, the admin controls and `deleteAccount`)  ->  `api/<name>.js`
 *   - the `onSchedule('every 15 minutes')` `cleanupExpired` job                        ->  `api/cleanup.js` (Vercel Cron)
 *   - the error-code -> HTTP-status map and the `makeHandlers`/`engines` wiring          ->  `api/_backend.js` and `functions/src/backend.js`
 *
 * The handler logic itself is unchanged and still lives in `functions/src/handlers.js`,
 * `functions/src/store.js` and `functions/src/cleanup.js`; it is imported by the Vercel routes and
 * remains covered by `functions/test`. Nothing is deployed from this file any more, so it
 * deliberately exports no functions — `firebase deploy --only functions` is now a no-op.
 *
 * To bring the Cloud Functions deployment back, restore the `callableFor(name)` wrappers here and
 * the `functions` block in `firebase.json`, and point `src/online/callables.js` back at
 * `httpsCallable`. Until then this file exists only to document the move.
 */

export {};
