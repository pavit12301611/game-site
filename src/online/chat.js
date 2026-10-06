/**
 * In-match chat.
 *
 * Design (privacy first):
 *   - Chat is only available while a match is in progress (`room.status === 'playing'`).
 *   - Members subscribe to the `rooms/{roomId}/chat` subcollection in chronological order.
 *   - Sending a message goes through the `sendChat` callable, which is the only writer (the
 *     Firestore rules deny client writes to chat/). The callable re-checks membership, rate limits
 *     (60 messages per minute per user), block lists, message length and that the room is live.
 *   - When a match ends (status becomes `finished`) or a rematch starts, the backend permanently
 *     deletes every message in the subcollection (`purgeRoomChat` in functions/src/handlers.js),
 *     so no chat text lingers in the database after the game.
 *   - The overall 1-hour room TTL is a safety net: chat lives under `rooms/{id}/chat/`, so the
 *     scheduled cleanup's `recursiveDelete(rooms/{id})` wipes any straggler too. Nothing stays in
 *     Firestore beyond that hour.
 */

import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { render, appRoot } from '../render.js';
import { state } from '../state.js';
import { friendlyError } from '../errors.js';
import { callBackend } from './callables.js';
import { showToast } from '../ui/toast.js';

/**
 * `db` is null only when Firebase never started; every caller below is reached only through a live
 * room subscription, which already requires Firebase to be running.
 */
const store = /** @type {import('firebase/firestore').Firestore} */ (db);

/** A no-op unsubscribe, so stop/start is always safe. */
const emptyUnsubscribe = () => {};

/** @type {() => void} */
let stopChat = emptyUnsubscribe;
/** Tracks whether the current snapshot listener has seen its first payload, so unread counts only
 *  increment for *new* messages after the panel is already mounted. */
let chatHasLoaded = false;

/** Tear down the current listener and clear any chat state. */
export function resetChat() {
  stopChat();
  stopChat = emptyUnsubscribe;
  chatHasLoaded = false;
  state.chatMessages = [];
  state.chatUnreadCount = 0;
  state.chatOpen = false;
  state.chatSending = false;
  state.chatError = '';
}

/**
 * Attach a listener to the room's chat subcollection, oldest first, bounded to a small cap so a
 * long rally cannot grow a DOM with hundreds of nodes.
 * @param {string} roomId
 */
export function subscribeToChat(roomId) {
  resetChat();
  if (!roomId) return;
  const recent = query(
    collection(store, 'rooms', roomId, 'chat'),
    orderBy('createdAtMs', 'asc'),
    limit(100),
  );
  stopChat = onSnapshot(recent, (snapshot) => {
    /** @type {Array<{id: string, uid: string, name: string, text: string, createdAtMs: number}>} */
    const messages = [];
    snapshot.forEach((doc) => {
      const data = doc.data() ?? {};
      const createdAtMs = Number(data.createdAtMs) || Date.now();
      messages.push({
        id: doc.id,
        uid: String(data.uid || ''),
        name: String(data.name || 'Player'),
        text: String(data.text || ''),
        createdAtMs,
      });
    });
    // Deduplicate by id (in case a retry writes the same logical message twice).
    const seen = new Set();
    state.chatMessages = messages.filter((message) => {
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    });
    // Unread counter only increments for messages that arrive after the initial load, and only
    // when the panel is closed. The first snapshot (existing history) never counts as "new".
    if (chatHasLoaded && !state.chatOpen && !snapshot.metadata.hasPendingWrites) {
      const newCount = snapshot.docChanges().filter((change) => change.type === 'added').length;
      state.chatUnreadCount = (state.chatUnreadCount || 0) + newCount;
    }
    chatHasLoaded = true;
    render();
    // Auto-scroll the chat log to the bottom when new messages arrive.
    scheduleScrollToBottom();
  }, () => {
    // A denied read or a missing subcollection is not fatal: the panel just draws empty.
    state.chatError = 'Chat is unavailable right now.';
    chatHasLoaded = true;
    render();
  });
}

/** Scroll the chat log to the newest message after render. */
function scheduleScrollToBottom() {
  requestAnimationFrame(() => {
    const log = /** @type {HTMLElement | null} */ (appRoot?.querySelector('.chat-log'));
    if (log) log.scrollTop = log.scrollHeight;
  });
}

export function toggleChatPanel() {
  state.chatOpen = !state.chatOpen;
  if (state.chatOpen) state.chatUnreadCount = 0;
  render();
  if (state.chatOpen) {
    scheduleScrollToBottom();
    // Focus the input so the player can type straight away.
    requestAnimationFrame(() => {
      const input = /** @type {HTMLInputElement | null} */ (appRoot?.querySelector('.chat-input'));
      input?.focus();
    });
  }
}

/**
 * Send a chat message through the trusted backend. An optimistic copy is drawn immediately and
 * replaced by the server-acknowledged document when it lands.
 * @param {string} rawText
 */
export async function sendChatMessage(rawText) {
  const roomId = state.roomId;
  const uid = state.user?.uid;
  if (!roomId || !uid || !state.room) throw new Error('Join a room before chatting.');
  if (state.room.status !== 'playing') throw new Error('Chat is only available while a match is in progress.');
  const text = String(rawText || '').trim();
  if (!text) return;
  if (text.length > 240) throw new Error('Keep chat messages under 240 characters.');
  state.chatSending = true;
  render();
  try {
    // The backend is the only writer (rules deny client writes), so we always go through the
    // callable. The snapshot listener will paint the server-acknowledged document when it lands.
    await callBackend('sendChat', { roomId, text });
    state.chatError = '';
  } catch (error) {
    state.chatError = friendlyError(error);
    showToast(friendlyError(error), 'warning');
  } finally {
    state.chatSending = false;
    render();
  }
}
