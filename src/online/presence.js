/**
 * Presence, the Firestore half: "who is still in this room".
 *
 * While you are in a room this module writes your heartbeat to `rooms/{roomId}/presence/{uid}`
 * (every HEARTBEAT_MS, only while the tab is visible) and listens to everybody's. The verdicts
 * (`here` / `away` / `left` / `unknown`) are computed in `src/presence-status.js` and read by the
 * lobby and the match rail through `state.presence`.
 *
 * Two deliberate choices:
 *
 * - The room is re-rendered only when a *verdict* changes, never on a heartbeat itself. A repaint
 *   every few seconds would reset the "How to play" panel and the scroll position mid-game.
 * - Leaving on purpose writes `status: 'left'`; closing the tab writes nothing and simply becomes
 *   `away` a minute later. Writing "left" on `pagehide` would brand every phone user who glanced at
 *   a message as having walked out.
 *
 * firestore.rules only lets a room member write their own heartbeat and lets members read all of
 * them; guests are members like anyone else, which is the reason presence lives with the room and
 * not with the (optional) profile.
 */

import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { render } from '../render.js';
import { currentPresence, state } from '../state.js';
import {
  PRESENCE_REFRESH_MS,
  clockOffset,
  createHeartbeat,
  presenceSignature,
} from '../presence-status.js';

/** `db` is null only when Firebase never started; presence only runs inside a room, which needs Firebase. */
const store = /** @type {import('firebase/firestore').Firestore} */ (db);

const noop = () => {};
/** Shown once when the project's rules do not know the presence collection yet. */
export const RULES_HINT = 'Presence is off: the deployed Firestore rules do not allow rooms/{roomId}/presence yet. Publish the latest firestore.rules (Firebase Console → Firestore Database → Rules) and this message goes away.';

let stopListener = noop;
/** @type {ReturnType<typeof createHeartbeat> | null} */
let heartbeat = null;
/** @type {ReturnType<typeof setInterval> | null} */
let refreshTimer = null;
let current = { roomId: '', uid: '' };
/** Local time of the last heartbeat we sent, for the server-clock estimate. */
/** @type {number | null} */
let lastSentAtMs = null;
let lastSignature = '';

/** @param {string} roomId @param {string} uid */
export function presenceDocRef(roomId, uid) {
  return doc(store, 'rooms', roomId, 'presence', uid);
}

function rerenderIfChanged() {
  const signature = presenceSignature(currentPresence());
  if (signature === lastSignature) return;
  lastSignature = signature;
  render();
}

function onVisibilityChange() {
  heartbeat?.visibilityChanged();
}

/**
 * Start beating and listening for `roomId` as `uid`. Idempotent for the same room and user, so the
 * reconnect path (which re-opens the room) does not double up.
 *
 * @param {string} roomId
 * @param {string} uid
 */
export function startPresence(roomId, uid) {
  if (current.roomId === roomId && current.uid === uid && heartbeat && !heartbeat.stopped) return;
  stopPresence({ markLeft: true });
  current = { roomId, uid };
  state.presence = {};
  state.presenceClockOffsetMs = 0;
  lastSentAtMs = null;
  lastSignature = '';

  const ownRef = presenceDocRef(roomId, uid);
  const loop = createHeartbeat({
    beat: () => {
      lastSentAtMs = Date.now();
      return setDoc(ownRef, { status: 'here', lastSeenAt: serverTimestamp() });
    },
    isVisible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
    onError: (error) => {
      const code = /** @type {any} */ (error)?.code;
      if (code === 'permission-denied') {
        // The deployed firestore.rules predate presence. Say so once and stop, instead of a
        // warning every 25 seconds; the room keeps working without presence.
        console.warn(`[PSD-gaming] ${RULES_HINT}`);
        loop.stop();
        return;
      }
      console.warn('[PSD-gaming] Presence heartbeat failed:', /** @type {any} */ (error)?.message);
    },
  });
  heartbeat = loop;
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);
  heartbeat.start();

  stopListener = onSnapshot(collection(store, 'rooms', roomId, 'presence'), (snapshot) => {
    /** @type {Record<string, import('../presence-status.js').PresenceRecord>} */
    const records = {};
    for (const entry of snapshot.docs) {
      // 'estimate' gives a pending heartbeat a provisional time instead of null, so our own slot
      // never flickers to "unknown" between sending a beat and the server acknowledging it.
      const data = entry.data({ serverTimestamps: 'estimate' });
      let lastSeenMs = typeof data.lastSeenAt?.toMillis === 'function' ? data.lastSeenAt.toMillis() : null;
      if (entry.id === uid && entry.metadata.hasPendingWrites) {
        // The estimate is local time; verdicts run on server time. Measured in the same clock, our
        // own beat in flight can never show us as "away" on a laptop whose clock is off.
        lastSeenMs = Date.now() + state.presenceClockOffsetMs;
      } else if (entry.id === uid && lastSeenMs !== null) {
        state.presenceClockOffsetMs = clockOffset(lastSeenMs, lastSentAtMs);
      }
      records[entry.id] = { lastSeenMs, status: data.status === 'left' ? 'left' : 'here' };
    }
    state.presence = records;
    rerenderIfChanged();
  }, (error) => {
    // Presence is advisory: a denied or failed listener must never take the room down with it.
    const code = /** @type {any} */ (error)?.code;
    console.warn(code === 'permission-denied' ? `[PSD-gaming] ${RULES_HINT}` : `[PSD-gaming] Presence could not be read: ${/** @type {any} */ (error)?.message}`);
  });

  refreshTimer = setInterval(rerenderIfChanged, PRESENCE_REFRESH_MS);
}

/**
 * Stop beating and listening. With `markLeft`, a last write tells the others you left on purpose;
 * it is best-effort, because the room may already be gone (the last player deletes it).
 *
 * @param {{ markLeft?: boolean }} [options]
 */
export function stopPresence({ markLeft = true } = {}) {
  const { roomId, uid } = current;
  const wasRunning = Boolean(heartbeat);
  heartbeat?.stop();
  heartbeat = null;
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
  stopListener();
  stopListener = noop;
  if (refreshTimer !== null) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  current = { roomId: '', uid: '' };
  state.presence = {};
  state.presenceClockOffsetMs = 0;
  lastSignature = '';
  if (wasRunning && markLeft && roomId && uid) {
    void setDoc(presenceDocRef(roomId, uid), { status: 'left', lastSeenAt: serverTimestamp() }).catch(noop);
  }
}

/**
 * Remove your own heartbeat document, for the transaction that gives a seat back (and may delete
 * the room): a deleted room must not leave presence litter behind.
 * @param {import('firebase/firestore').Transaction} transaction
 * @param {string} roomId
 * @param {string} uid
 */
export function deletePresenceIn(transaction, roomId, uid) {
  transaction.delete(presenceDocRef(roomId, uid));
}
