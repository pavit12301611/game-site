/**
 * The retention and recent-auth numbers the UI talks about, re-exported from the shared table so the
 * privacy notice and the Cloud Function that deletes the data can never disagree.
 *
 * The numbers live in `shared/online/retention.js`; nothing browser-only belongs in this file.
 */
export {
  CLEANUP_INTERVAL_MS,
  FINISHED_ROOM_GRACE_MS,
  FRIEND_REQUEST_MAX_AGE_MS,
  INVITE_MAX_AGE_MS,
  RATE_LIMIT_MAX_AGE_MS,
  RECENT_AUTH_WINDOW_MS,
  REPORT_MAX_AGE_MS,
  ROOM_TTL_MS,
} from '../shared/online/retention.js';
