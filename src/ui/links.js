/**
 * The invite link: how a room becomes something you can send to a friend.
 *
 * `navigator.share` is used when the browser has it (phones), and falls back to the clipboard
 * everywhere else. The link is just the current origin plus `#/room/<id>`, so it works on a local
 * dev server, a Vercel preview, and production without any configuration.
 */

import { state } from '../state.js';
import { getGame } from '../catalog.js';
import { showToast } from './toast.js';

export function formatGameLink(roomId = state.room?.id) {
  return `${location.origin}${location.pathname}#/room/${roomId}`;
}

export async function copyRoomLink() {
  if (!state.room?.id) return;
  try {
    await navigator.clipboard.writeText(formatGameLink());
    showToast('Invite link copied. Send it to your crew.');
  } catch {
    const field = document.createElement('textarea');
    field.value = formatGameLink();
    field.style.position = 'fixed'; field.style.opacity = '0';
    document.body.append(field); field.select();
    const copied = document.execCommand('copy'); field.remove();
    showToast(copied ? 'Invite link copied. Send it to your crew.' : formatGameLink(), copied ? 'success' : 'warning');
  }
}

export async function shareRoomLink() {
  if (!state.room?.id) return copyRoomLink();
  const url = formatGameLink();
  if (navigator.share) {
    try {
      await navigator.share({ title: `${getGame(state.room.gameId)?.title || 'PSD-gaming'} room`, text: 'Join my PSD-gaming room.', url });
      showToast('Invite shared.');
      return;
    } catch (error) {
      if (/** @type {any} */ (error)?.name === 'AbortError') return;
    }
  }
  await copyRoomLink();
}
