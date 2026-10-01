/**
 * Player presentation helpers: the name shown for a uid, a player's seat index, and the mark drawn
 * for that seat on the boards.
 */
import { currentPlayers, state } from '../state.js';

export function activeName(uid, players = currentPlayers()) {
  return players.find((player) => player.uid === uid)?.name || 'A player';
}

export function playerIndex(uid, players) {
  return players.findIndex((player) => player.uid === uid);
}

export function playerMark(index) {
  return ['✕', '◯', '◇'][Math.max(0, index) % 3];
}

/**
 * True when this account is linked to Google. Google accounts land here after a redirect with no
 * username chosen yet, so the UI nudges them into the username step instead of the sign-up form.
 */
export function isGoogleUser(user = state.user) {
  return Boolean(user?.providerData?.some((provider) => provider.providerId === 'google.com'));
}

/** The best name to show for a player: claimed username > chosen display name > Google name > guest tag. */
export function playerDisplayName(user = state.user) {
  if (state.profile?.username && user?.uid === state.user?.uid) return state.profile.username;
  if (state.displayName.trim()) return state.displayName.trim().slice(0, 20);
  if (user?.displayName) return user.displayName;
  return user?.isAnonymous ? `Guest ${user.uid.slice(0, 4)}` : 'Arcade player';
}
