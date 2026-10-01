/**
 * Presence: is each player still in the room?
 *
 * This is the pure half - no Firebase, no DOM - so the verdicts and the heartbeat loop can be
 * unit-tested. The Firestore half is `src/online/presence.js`: every member of a room writes a
 * heartbeat document `rooms/{roomId}/presence/{uid}` every HEARTBEAT_MS while their tab is visible,
 * writes `status: 'left'` when they leave on purpose, and everyone in the room listens to those
 * documents.
 *
 * Why not the profile document? Guests are anonymous accounts and have no profile, and presence is
 * per room anyway: the question is "is Bob still in *this* room", not "is Bob online somewhere".
 *
 * Verdicts are deliberately coarse. A player is `here` while their heartbeat is fresh, `away` once
 * it is older than AWAY_AFTER_MS (two missed beats plus clock skew), `left` when they said so, and
 * `unknown` when there is no heartbeat at all yet (a client from before this feature, or a write
 * that has not landed). `unknown` is shown exactly like `here` was shown before presence existed:
 * presence is advisory, and a missing document must never read as an accusation.
 */

/** How often a visible tab writes its heartbeat. */
export const HEARTBEAT_MS = 25_000;
/** A heartbeat older than this means away: two missed beats, plus room for clock skew. */
export const AWAY_AFTER_MS = 60_000;
/** How often the room re-checks the verdicts while nothing else changes (a player going quiet). */
export const PRESENCE_REFRESH_MS = 10_000;

/**
 * @typedef {object} PresenceRecord
 * @property {number | null} lastSeenMs  server time of the last heartbeat, or null when unknown
 * @property {'here' | 'left'} status
 */

/**
 * @typedef {object} PresenceVerdict
 * @property {'here' | 'away' | 'left' | 'unknown'} kind
 * @property {string} label    capitals for the lobby slot, e.g. "AWAY · 2 MIN"
 * @property {string} detail   sentence case for the match rail, e.g. "Away for 2 min"; '' when there is nothing to add
 * @property {number | null} awayForMs  how long since the last heartbeat, when away
 */

/**
 * Human-sized duration for the labels: "20 s", "3 min", "2 hr".
 * @param {number} ms
 */
export function formatAwayFor(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr`;
}

/**
 * The verdict for one player.
 *
 * @param {PresenceRecord | null | undefined} record
 * @param {number} nowMs  the current time on the server clock (see `clockOffset` below)
 * @param {{ awayAfterMs?: number }} [options]
 * @returns {PresenceVerdict}
 */
export function describePresence(record, nowMs, { awayAfterMs = AWAY_AFTER_MS } = {}) {
  if (!record) return { kind: 'unknown', label: 'IN THE ROOM', detail: '', awayForMs: null };
  if (record.status === 'left') return { kind: 'left', label: 'LEFT THE ROOM', detail: 'Left the room', awayForMs: null };
  if (typeof record.lastSeenMs !== 'number') return { kind: 'unknown', label: 'IN THE ROOM', detail: '', awayForMs: null };
  const age = nowMs - record.lastSeenMs;
  if (age <= awayAfterMs) return { kind: 'here', label: 'IN THE ROOM', detail: '', awayForMs: null };
  const awayFor = formatAwayFor(age);
  return { kind: 'away', label: `AWAY · ${awayFor.toUpperCase()}`, detail: `Away for ${awayFor}`, awayForMs: age };
}

/**
 * Verdicts for every player in the room, keyed by uid.
 *
 * @param {string[]} uids
 * @param {Record<string, PresenceRecord>} records
 * @param {number} nowMs
 * @returns {Record<string, PresenceVerdict>}
 */
export function presenceVerdicts(uids, records, nowMs) {
  /** @type {Record<string, PresenceVerdict>} */
  const out = {};
  for (const uid of uids) out[uid] = describePresence(records?.[uid], nowMs);
  return out;
}

/**
 * A fingerprint of the verdict *kinds*, so the room only re-renders when someone's status actually
 * changes - not on every heartbeat, which would reset the "How to play" panel mid-game.
 *
 * @param {Record<string, PresenceVerdict>} verdicts
 */
export function presenceSignature(verdicts) {
  return Object.keys(verdicts).sort().map((uid) => `${uid}:${verdicts[uid].kind}`).join('|');
}

/**
 * Server-clock estimate. `lastSeenAt` is written with the server's clock, so comparing it with the
 * local clock would make a player on a slow laptop look "away" at once. The offset is measured from
 * our own heartbeat: the server time it got, minus the local time we sent it.
 *
 * @param {number | null} ownServerMs  server time of our last acknowledged heartbeat
 * @param {number | null} ownSentAtMs  local time that heartbeat was sent
 * @returns {number} milliseconds to add to Date.now()
 */
export function clockOffset(ownServerMs, ownSentAtMs) {
  if (typeof ownServerMs !== 'number' || typeof ownSentAtMs !== 'number') return 0;
  return ownServerMs - ownSentAtMs;
}

/**
 * The heartbeat loop. Beats at once and then every `intervalMs` while the tab is visible; a tab
 * that goes hidden stops beating (so a closed or backgrounded tab honestly reads as away), and
 * beats again the moment it is visible. `stop()` is final and idempotent.
 *
 * Everything it needs is passed in so the tests can drive it with fake timers.
 *
 * @param {{
 *   beat: () => unknown,
 *   intervalMs?: number,
 *   isVisible?: () => boolean,
 *   setInterval?: typeof globalThis.setInterval,
 *   clearInterval?: typeof globalThis.clearInterval,
 *   onError?: (error: unknown) => void,
 * }} deps
 */
export function createHeartbeat({
  beat,
  intervalMs = HEARTBEAT_MS,
  isVisible = () => true,
  setInterval = globalThis.setInterval.bind(globalThis),
  clearInterval = globalThis.clearInterval.bind(globalThis),
  onError = () => {},
}) {
  /** @type {ReturnType<typeof globalThis.setInterval> | null} */
  let timer = null;
  let stopped = false;
  const tick = () => {
    if (stopped || !isVisible()) return;
    Promise.resolve().then(beat).catch(onError);
  };
  const pause = () => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };
  const start = () => {
    if (stopped || timer !== null) return;
    // A hidden tab does not beat; `visibilityChanged` starts the loop when it comes back.
    if (!isVisible()) return;
    tick();
    timer = setInterval(tick, intervalMs);
  };
  return {
    start,
    /** Call on `visibilitychange`: a hidden tab pauses, a visible one beats at once and resumes. */
    visibilityChanged() {
      if (stopped) return;
      if (isVisible()) start();
      else pause();
    },
    stop() {
      stopped = true;
      pause();
    },
    get running() {
      return timer !== null;
    },
    get stopped() {
      return stopped;
    },
  };
}
