/**
 * In-room chat: send and display messages.
 */

import { state } from '../state.js';
import { render } from '../render.js';
import { showToast } from '../ui/toast.js';
import { friendlyError } from '../errors.js';
import * as api from './callables.js';

/**
 * Sends a chat message in the current room.
 * @param {string} text
 */
export async function sendChatMessage(text) {
  if (!state.roomId) return;
  if (!text.trim()) return;
  if (text.length > 200) throw new Error('Messages must be under 200 characters.');

  state.chatSending = true;
  state.chatError = '';
  render();

  try {
    await api.sendChat({ roomId: state.roomId, text: text.trim() });
    state.chatSending = false;
    render();
  } catch (error) {
    state.chatSending = false;
    state.chatError = friendlyError(error);
    render();
  }
}

/**
 * Toggles the chat side-panel open/closed.
 */
export function toggleChatPanel() {
  state.chatOpen = !state.chatOpen;
  if (state.chatOpen) state.chatUnreadCount = 0;
  render();
}