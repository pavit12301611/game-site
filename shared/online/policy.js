/**
 * Online play policy constants, shared between browser and backend.
 */

/** Maximum number of moves per window before rate limiting kicks in. */
export const MOVE_RATE_LIMIT = 60;
export const MOVE_RATE_WINDOW_MS = 60_000;

/** Maximum chat messages per room. */
export const MAX_CHAT_MESSAGES = 100;
export const MAX_CHAT_LENGTH = 200;