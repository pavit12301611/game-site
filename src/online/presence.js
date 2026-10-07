/**
 * Presence: heartbeat system for showing who is still in a room.
 */

import { db, firebaseReady } from '../firebase.js';
import { state } from '../state.js';
import { render } from '../render.js';
import { doc, setDoc, serverTimestamp, deleteDoc, onSnapshot } from 'firebase/firestore';
import { currentPresence } from '../state.js';

const HEARTBEAT_MS = 25_000;
const HEARTBEAT_DOC_PATH = (roomId, uid) => `rooms/${roomId}/presence/${uid}`;

let heartbeatTimer = null;
let presenceUnsubscribe = null;
let clockOffsetSamples = [];

/**
 * Starts sending heartbeats and listening to the room's presence.
 */
export function startPresence(roomId) {
  stopPresence();
  if (!firebaseReady || !roomId) return;

  // Listen to all presence docs in this room
  const { collection, query, onSnapshot: onSnap } = import('firebase/firestore').then ? {} : {};

  // Start heartbeat loop
  sendHeartbeat(roomId);
  heartbeatTimer = window.setInterval(() => sendHeartbeat(roomId), HEARTBEAT_MS);

  // Listen to presence subcollection
  import('firebase/firestore').then(({ collection, onSnapshot: onSnap }) => {
    const presenceRef = collection(db, 'rooms', roomId, 'presence');
    presenceUnsubscribe = onSnap(presenceRef, (snapshot) => {
      const data = {};
      for (const change of snapshot.docChanges()) {
        const d = change.doc.data();
        const uid = change.doc.id;
        data[uid] = {
          status: d.status || 'here',
          lastSeenMs: d.lastSeenAt?.toMillis?.() || Date.now(),
        };
      }
      state.presence = { ...state.presence, ...data };

      // Compute clock offset from our own heartbeat
      const myUid = state.user?.uid;
      if (myUid && data[myUid]) {
        const serverMs = data[myUid].lastSeenMs;
        const localMs = Date.now();
        clockOffsetSamples.push(serverMs - localMs);
        if (clockOffsetSamples.length > 5) clockOffsetSamples.shift();
        state.presenceClockOffsetMs = clockOffsetSamples.reduce((a, b) => a + b, 0) / clockOffsetSamples.length;
      }

      render();
    });
  });
}

/**
 * Sends a single heartbeat.
 */
async function sendHeartbeat(roomId) {
  const uid = state.user?.uid;
  if (!uid || !firebaseReady || document.visibilityState !== 'visible') return;

  try {
    await setDoc(doc(db, HEARTBEAT_DOC_PATH(roomId, uid)), {
      status: 'here',
      lastSeenAt: serverTimestamp(),
    });
  } catch (error) {
    // If the rules don't allow presence, warn once and disable
    if (error?.code === 'permission-denied') {
      console.warn('[PSD-gaming] Presence is off: the deployed Firestore rules do not allow rooms/{roomId}/presence yet.');
      stopPresence();
    }
  }
}

/**
 * Stops the heartbeat and presence listener.
 */
export function stopPresence() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (presenceUnsubscribe) {
    presenceUnsubscribe();
    presenceUnsubscribe = null;
  }
}

/**
 * Marks the current user as having left the room.
 */
export async function markLeft(roomId) {
  const uid = state.user?.uid;
  if (!uid || !firebaseReady || !roomId) return;
  try {
    await setDoc(doc(db, HEARTBEAT_DOC_PATH(roomId, uid)), {
      status: 'left',
      lastSeenAt: serverTimestamp(),
    });
  } catch { /* best effort */ }
}

/** Re-renders when visibility changes. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render();
});