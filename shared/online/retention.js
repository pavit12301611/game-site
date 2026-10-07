/**
 * Data retention windows: how long each type of document lives before the cleanup function
 * deletes it. Shared between the backend (scheduled cleanup) and the browser (privacy notice).
 */

export const RETENTION = Object.freeze({
  room: { hours: 1 },
  hiddenState: { hours: 1 },
  presence: { hours: 1 },
  invite: { hours: 24 },
  friendRequest: { hours: 72 },
  rateLimit: { hours: 24 },
  report: { days: 30 },
});