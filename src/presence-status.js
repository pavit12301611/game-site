/**
 * Presence verdicts: here / away / left, derived from heartbeat timestamps.
 */

const AWAY_THRESHOLD_MS = 60_000;

/**
 * @typedef {{ status: 'here'|'away'|'left', lastSeenMs: number }} PresenceVerdict
 */

/**
 * Computes presence verdicts for all players in a room.
 * @param {string[]} playerUids
 * @param {Record<string, { lastSeenMs: number, status: string }>} presence
 * @param {number} nowMs
 * @returns {Record<string, PresenceVerdict>}
 */
export function presenceVerdicts(playerUids, presence, nowMs) {
  const result = {};
  for (const uid of playerUids) {
    const doc = presence[uid];
    if (!doc) {
      // No heartbeat doc: treat as "here" (pre-presence client)
      result[uid] = { status: 'here', lastSeenMs: 0 };
      continue;
    }
    if (doc.status === 'left') {
      result[uid] = { status: 'left', lastSeenMs: doc.lastSeenMs || 0 };
      continue;
    }
    const age = nowMs - (doc.lastSeenMs || 0);
    result[uid] = {
      status: age > AWAY_THRESHOLD_MS ? 'away' : 'here',
      lastSeenMs: doc.lastSeenMs || 0,
    };
  }
  return result;
}