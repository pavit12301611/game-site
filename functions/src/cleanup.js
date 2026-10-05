/**
 * Scheduled data lifecycle.
 *
 * The old design relied on whichever browser happened to be open: a room was deleted by the last
 * client that cared, and if nobody cared the room and its heartbeats stayed in Firestore forever.
 * That is now the backend's job:
 *
 *   1. every room past its `expiresAt` is deleted with its server-only state, private views and
 *      presence heartbeats,
 *   2. finished rooms are deleted once their grace period is over, so "play again" still works for a
 *      while after the last move,
 *   3. game invites and friend requests pointing at gone rooms or long-since-expired requests are
 *      removed,
 *   4. rate-limit documents that only hold stale buckets are removed.
 *
 * The function is idempotent by construction: every step deletes documents, treats "already gone" as
 * success, and stops at a per-run cap so a retry after a timeout simply continues where it stopped.
 * Run it from the scheduler every 15 minutes; it is also safe to invoke by hand from the Firebase
 * console while debugging.
 */

import {
  FINISHED_ROOM_GRACE_MS,
  FRIEND_REQUEST_MAX_AGE_MS,
  INVITE_MAX_AGE_MS,
  RATE_LIMIT_MAX_AGE_MS,
  REPORT_MAX_AGE_MS,
} from '../vendor/shared/online/retention.js';

/** Per run caps: a retry continues the work, and one invocation cannot exceed its timeout. */
export const CLEANUP_LIMITS = Object.freeze({
  rooms: 200,
  finishedRooms: 100,
  invites: 300,
  requests: 300,
  rateLimits: 300,
});

/**
 * @typedef {{ store: import('./store.js').Store, nowMs: number }} CleanupDeps
 */

/**
 * Deletes one room and everything that belongs to it.
 * @param {import('./store.js').Store} store
 * @param {string} roomId
 */
export async function purgeRoom(store, roomId) {
  // `recursiveDelete` removes the room, its secrets/engine state, its private views and presence.
  await store.recursiveDelete(`rooms/${roomId}`);
  const invites = await store.query('gameInvites', { where: [['roomId', '==', roomId]], limit: 50 });
  for (const invite of invites) await store.delete(`gameInvites/${invite.id}`);
  return { roomId, invites: invites.length };
}

/**
 * @param {CleanupDeps} deps
 * @returns {Promise<Record<string, number>>} what this run removed, for the scheduler log
 */
export async function cleanupExpiredData({ store, nowMs }) {
  const summary = {
    expiredRooms: 0,
    finishedRooms: 0,
    invites: 0,
    requests: 0,
    rateLimits: 0,
    reports: 0,
  };

  const expired = await store.query('rooms', { where: [['expiresAt', '<=', nowMs]], limit: CLEANUP_LIMITS.rooms });
  for (const room of expired) {
    const result = await purgeRoom(store, room.id);
    summary.expiredRooms += 1;
    summary.invites += result.invites;
  }

  const finished = await store.query('rooms', {
    where: [['status', '==', 'finished'], ['expiresAt', '>', nowMs]],
    limit: CLEANUP_LIMITS.finishedRooms,
    orderBy: ['updatedAt', 'asc'],
  });
  for (const room of finished) {
    const finishedAt = Number(room.data.finishedAt ?? room.data.updatedAt ?? 0);
    if (!finishedAt || nowMs - finishedAt > FINISHED_ROOM_GRACE_MS) {
      const result = await purgeRoom(store, room.id);
      summary.finishedRooms += 1;
      summary.invites += result.invites;
    }
  }

  // Invites whose room no longer exists (or that are long past the share window) go too.
  const invites = await store.query('gameInvites', { where: [['createdAtMs', '<', nowMs - INVITE_MAX_AGE_MS]], limit: CLEANUP_LIMITS.invites });
  for (const invite of invites) {
    await store.delete(`gameInvites/${invite.id}`);
    summary.invites += 1;
  }

  const requests = await store.query('friendRequests', { where: [['createdAtMs', '<', nowMs - FRIEND_REQUEST_MAX_AGE_MS]], limit: CLEANUP_LIMITS.requests });
  for (const request of requests) {
    await store.delete(`friendRequests/${request.id}`);
    summary.requests += 1;
  }

  const rateLimits = await store.query('rateLimits', { where: [['updatedAtMs', '<', nowMs - RATE_LIMIT_MAX_AGE_MS]], limit: CLEANUP_LIMITS.rateLimits });
  for (const record of rateLimits) {
    await store.delete(`rateLimits/${record.id}`);
    summary.rateLimits += 1;
  }

  const reports = await store.query('reports', { where: [['createdAtMs', '<', nowMs - REPORT_MAX_AGE_MS]], limit: CLEANUP_LIMITS.requests });
  for (const report of reports) {
    await store.delete(`reports/${report.id}`);
    summary.reports += 1;
  }

  return summary;
}
