/**
 * Room link helpers: copy and share.
 */

import { state } from '../state.js';
import { showToast } from './toast.js';

/**
 * Copies the room link to clipboard.
 */
export async function copyRoomLink() {
  const url = `${location.origin}${location.pathname}#/room/${state.roomId}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast('Room link copied.', 'success');
  } catch {
    showToast(url, 'warning');
  }
}

/**
 * Shares the room link using the Web Share API when available.
 */
export async function shareRoomLink() {
  const url = `${location.origin}${location.pathname}#/room/${state.roomId}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Join my game!', url });
    } catch { /* user cancelled */ }
  } else {
    await copyRoomLink();
  }
}