/**
 * The online policy: room lifetime, what each engine hides, how fast a player may act, and the
 * per-user rate limits the trusted backend enforces.
 *
 * This module is shared by the browser (which mirrors the same tempo locally so an honest client and
 * the server agree) and by Cloud Functions (which are the only writers of room state). Its only
 * import is the retention table, which is dependency-free; nothing here may touch the DOM or `window`.
 */

// The lifetime numbers live in ./retention.js because the privacy notice prints them too.
export { FINISHED_ROOM_GRACE_MS, ROOM_TTL_MS } from './retention.js';

/** A waiting lobby whose host has been away this long gets a new host (see `handoffHost`). */
export const HOST_HANDOFF_AFTER_MS = 75 * 1000;
export const EXPIRED_ROOM_MESSAGE = 'This room expired after 1 hour and was automatically deleted.';

/** Room ids are 20 characters from the Web SDK. The join box accepts the 7-character display code. */
export const ROOM_CODE_LENGTH = 7;

/**
 * What each engine hides from the other players, and whether a client may draw its own move before
 * the server answers.
 *
 * hidden        the authoritative state must live in the server-only document
 * optimistic    the client may render a move immediately (only true when the public state is the
 *               whole story, so a local frame cannot drift from the server's view)
 * privateView   the player receives a personal document with fields the others must not see
 */
export const ENGINE_POLICY = Object.freeze({
  line: { hidden: false, optimistic: true, privateView: false },
  drop: { hidden: false, optimistic: true, privateView: false },
  memory: { hidden: true, optimistic: false, privateView: false },
  race: { hidden: false, optimistic: true, privateView: false },
  rps: { hidden: true, optimistic: false, privateView: false },
  quiz: { hidden: true, optimistic: false, privateView: false },
  maze: { hidden: false, optimistic: true, privateView: false },
  battle: { hidden: true, optimistic: false, privateView: true },
  rally: { hidden: false, optimistic: true, privateView: false },
  code: { hidden: true, optimistic: false, privateView: false },
});

/**
 * Per-user limits. Client-side timers are not security controls, so every one of these is enforced
 * by the backend against a server-clock window; the numbers are deliberately generous for a human
 * and tight for a script.
 */
export const RATE_LIMITS = Object.freeze({
  createRoom: Object.freeze({ windowMs: 60 * 60 * 1000, max: 20, label: 'rooms per hour' }),
  joinRoom: Object.freeze({ windowMs: 60 * 60 * 1000, max: 300, label: 'room joins per hour' }),
  playMove: Object.freeze({ windowMs: 60 * 1000, max: 1200, label: 'moves per minute' }),
  rematch: Object.freeze({ windowMs: 10 * 60 * 1000, max: 40, label: 'rematches per ten minutes' }),
  lookupUser: Object.freeze({ windowMs: 60 * 60 * 1000, max: 60, label: 'username lookups per hour' }),
  friendRequest: Object.freeze({ windowMs: 24 * 60 * 60 * 1000, max: 40, label: 'friend requests per day' }),
  respondFriendRequest: Object.freeze({ windowMs: 24 * 60 * 60 * 1000, max: 200, label: 'friend answers per day' }),
  gameInvite: Object.freeze({ windowMs: 24 * 60 * 60 * 1000, max: 80, label: 'game invites per day' }),
  report: Object.freeze({ windowMs: 24 * 60 * 60 * 1000, max: 10, label: 'reports per day' }),
  review: Object.freeze({ windowMs: 24 * 60 * 60 * 1000, max: 3, label: 'reviews per day' }),
  claimUsername: Object.freeze({ windowMs: 24 * 60 * 60 * 1000, max: 10, label: 'username claims per day' }),
  deleteAccount: Object.freeze({ windowMs: 24 * 60 * 60 * 1000, max: 3, label: 'account deletions per day' }),
});

/** The action keys each engine understands. Anything else is rejected, never stored. */
export const ACTION_KEYS = Object.freeze({
  line: Object.freeze(['index']),
  drop: Object.freeze(['col']),
  memory: Object.freeze(['index']),
  race: Object.freeze(['type', 'count']),
  rps: Object.freeze(['choice']),
  quiz: Object.freeze(['answer', 'type']),
  maze: Object.freeze(['direction']),
  battle: Object.freeze(['targetUid', 'index']),
  rally: Object.freeze(['lane']),
  code: Object.freeze(['guess']),
});

/** How many taps one race move call may carry, and how many can be saved up. */
export const RACE_BURST_TAPS = 4;
export const RACE_MAX_TAPS_PER_CALL = 40;

/** A room is created with at most this many seats. */
export const MAX_ROOM_PLAYERS = 3;

/**
 * One bucket of a per-user rate limit.
 * @typedef {{ windowStart: number, count: number }} RateBucket
 * @typedef {Record<string, RateBucket>} RateRecord
 */

/**
 * Checks one rate-limit bucket and returns the record to store.
 *
 * Pure on purpose: the same function runs in the backend (with the server clock) and in tests.
 * @param {RateRecord | null | undefined} record
 * @param {string} key
 * @param {{ windowMs: number, max: number }} policy
 * @param {number} nowMs
 * @returns {{ ok: boolean, retryAfterMs: number, remaining: number, next: RateRecord }}
 */
export function checkRateLimit(record, key, policy, nowMs) {
  const buckets = { ...(record || {}) };
  const bucket = buckets[key];
  if (!bucket || !Number.isFinite(bucket.windowStart) || nowMs - bucket.windowStart >= policy.windowMs) {
    buckets[key] = { windowStart: nowMs, count: 1 };
    return { ok: true, retryAfterMs: 0, remaining: policy.max - 1, next: buckets };
  }
  if (bucket.count >= policy.max) {
    return { ok: false, retryAfterMs: Math.max(0, bucket.windowStart + policy.windowMs - nowMs), remaining: 0, next: buckets };
  }
  buckets[key] = { windowStart: bucket.windowStart, count: bucket.count + 1 };
  return { ok: true, retryAfterMs: 0, remaining: policy.max - bucket.count - 1, next: buckets };
}

/** Drops buckets that have expired, so the rate-limit document cannot grow forever. */
export function pruneRateRecord(record, nowMs) {
  const next = {};
  for (const [key, bucket] of Object.entries(record || {})) {
    const policy = RATE_LIMITS[/** @type {keyof typeof RATE_LIMITS} */ (key)];
    const windowMs = policy?.windowMs ?? 24 * 60 * 60 * 1000;
    if (Number.isFinite(bucket?.windowStart) && nowMs - bucket.windowStart < windowMs) next[key] = bucket;
  }
  return next;
}

/**
 * A token bucket for tap tempo: how many taps of a batch may count right now.
 *
 * `gapMs === 0` means "no tempo rule" and accepts everything. Otherwise taps refill at one per gap,
 * up to a small burst so a normal double-tap is not punished. The browser mirrors this exactly, so
 * an honest client's optimistic frame matches what the server ends up writing.
 *
 * @param {{ gapMs: number, tokens: number, lastAtMs: number }} bucket
 * @param {number} requested
 * @param {number} nowMs
 * @returns {{ accepted: number, next: { gapMs: number, tokens: number, lastAtMs: number } }}
 */
export function takeTapTokens(bucket, requested, nowMs) {
  const gapMs = Math.max(0, Number(bucket?.gapMs) || 0);
  const asked = Math.max(1, Math.min(Number(requested) || 1, RACE_MAX_TAPS_PER_CALL));
  if (gapMs === 0) return { accepted: asked, next: { gapMs, tokens: RACE_BURST_TAPS, lastAtMs: nowMs } };
  const lastAtMs = Number.isFinite(bucket?.lastAtMs) ? bucket.lastAtMs : nowMs;
  const elapsed = Math.max(0, nowMs - lastAtMs);
  const tokens = Math.min(RACE_BURST_TAPS, (Number(bucket?.tokens) || 0) + elapsed / gapMs);
  const accepted = Math.min(asked, Math.floor(tokens));
  const spent = accepted;
  return { accepted, next: { gapMs, tokens: Math.max(0, tokens - spent), lastAtMs: spent > 0 ? nowMs : lastAtMs } };
}
