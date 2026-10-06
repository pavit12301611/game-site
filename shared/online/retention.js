/**
 * How long data lives, in one place.
 *
 * These windows are used by the browser (the privacy notice prints them) *and* by the scheduled
 * Cloud Function that deletes the data, so a doc sentence and a cleanup query can never drift apart.
 * The module is deliberately dependency-free: the browser bundle, Cloud Functions and the tests all
 * import the same numbers.
 *
 * Changing a window is a product decision, not a code detail: the privacy notice reads this file.
 */

/** A room stops working after this long, and cleanup deletes it soon after. */
export const ROOM_TTL_MS = 60 * 60 * 1000;
/** A finished room is kept this long so "play again" still works after the last move. */
export const FINISHED_ROOM_GRACE_MS = 10 * 60 * 1000;
/** A game invite is cleared this long after it was created. */
export const INVITE_MAX_AGE_MS = 2 * 60 * 60 * 1000;
/** An unanswered friend request is cleared after this long. */
export const FRIEND_REQUEST_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Rate-limit counters are pruned once every bucket inside them has expired. */
export const RATE_LIMIT_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;
/** Reports are kept for the operator this long, then deleted by the scheduled cleanup. */
export const REPORT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
/** Public community reviews are automatically removed after one year. */
export const REVIEW_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
/** How long a recent sign-in is accepted when an account deletes itself (Firebase's own window). */
export const RECENT_AUTH_WINDOW_MS = 10 * 60 * 1000;
/** The scheduled cleanup runs this often; the number is quoted in the privacy notice. */
export const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
