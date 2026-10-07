import {
  GAMES,
  createInitialGameState,
  getGame,
} from './catalog.js';
import { DEFAULT_CODE_DRAFT } from './state.js';
import {
  state,
  currentGame,
  currentGameState,
} from './state.js';
import { boot } from './boot.js';
import { runLiveCheck } from './diagnostics.js';
import { scheduleCpuMove, sendGameAction, startCpuRaceLoop, startPractice } from './cpu.js';
import {
  deleteAccountNow,
  handleGoogleSignIn,
  processGoogleRedirect,
  refreshAccount,
  registerProfile,
} from './accounts.js';
import { applyTheme, toggleTheme } from './ui/theme.js';
import { setSoundEnabled } from './ui/sound.js';
import { recordRecentGame, toggleFavorite } from './ui/prefs.js';
import { copyRoomLink, shareRoomLink } from './ui/links.js';
import {
  appRoot,
  render,
} from './render.js';
import {
  friendlyError,
  reportAuthError,
} from './errors.js';
import { ensureOnlineUser } from './online/session.js';
import {
  navigate,
  parseHash,
  routeFromHash,
} from './router.js';
import {
  blockPlayer,
  joinGameInvite,
  reportProblem,
  requestFriendSearch,
  respondToFriend,
  sendFriendRequest,
  unblockPlayer,
} from './social.js';
import {
  adminDeleteFriendRequest,
  adminDeleteFriendship,
  adminDeleteGameInvite,
  adminDeleteRoom,
  adminLabelReview,
  adminTrainReviewAgent,
  adminGrantAccess,
  adminKickPlayer,
  adminRemovePlayer,
  adminRevokeAccess,
  adminSetMaintenance,
  loadAdminData,
} from './online/admin.js';
import { initializeMaintenance, verifyMaintenancePin } from './maintenance.js';
import { loadFeaturedReview, loadPublicReviews, submitReview } from './reviews.js';
import {
  claimHost,
  createOnlineRoom,
  joinRoomByCode,
  leaveWaitingRoom,
  openRoomFromLink,
  rematchRoom,
  startRoom,
} from './online/rooms.js';
import { showToast } from './ui/toast.js';
import { setupError } from './connection.js';
import {
  filteredGames,
  renderGameGrid,
} from './views/pages.js';
import {
  auth,
  firebaseReady,
} from './firebase.js';

import { handleBoardArrows, trapDialogTab } from './a11y.js';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  DISPLAY_NAME_STORAGE_KEY,
  suggestUsername,
} from './helpers.js';

/**
 * `auth` and `db` are null only when Firebase never started. Every use below sits behind a
 * `firebaseReady` check, or behind a sign-in or a room that can only exist with Firebase running,
 * so these casts state what those guards already guarantee (the same pattern as src/accounts.js).
 */
const authInstance = /** @type {import('firebase/auth').Auth} */ (auth);

function routeBackToCatalog() {
  window.clearTimeout(state.cpuTimer);
  state.cpuPending = false;
  state.local = null;
  state.modal = null;
  navigate('catalog');
}

function modalOpen(modal) {
  state.modal = modal;
  render();
}

function modalClose() {
  state.modal = null;
  state.authError = '';
  render();
}

async function handleUsernameSetupSubmit(form) {
  if (!firebaseReady || !state.user || state.user.isAnonymous) throw new Error('A confirmed signed-in account is required to choose a username.');
  const username = String(new FormData(form).get('username') || '').trim();
  await registerProfile(state.user, username);
  state.modal = null;
  render();
  showToast(`Welcome, @${username}. Friend features are ready.`);
}

/**
 * Join with a room code instead of a link.
 *
 * The code is looked up by the backend against `rooms.code`; the browser never queries the rooms
 * collection, so a code cannot be used to enumerate rooms, only to open one you were given.
 */
async function handleJoinCodeSubmit(form) {
  const code = String(new FormData(form).get('code') || '').trim();
  await joinRoomByCode(code);
  showToast('Room found. Settling you in…');
}

/** Send a report and say plainly what happens next (nothing automatic — the operator reads it). */
async function handleReportSubmit(form) {
  const formData = new FormData(form);
  const modal = state.modal?.type === 'report' ? state.modal : {};
  const result = await reportProblem({
    kind: String(formData.get('kind') || 'other'),
    message: String(formData.get('message') || ''),
    targetUid: modal.targetUid || '',
    roomId: modal.roomId || '',
  });
  state.modal = null;
  render();
  showToast(`Report ${String(result?.reportId || '').slice(0, 6)} stored for the operator. They read reports by hand; nothing was sent to the other player.`, 'success');
}

/**
 * Delete the account through the backend. A stale sign-in is a normal outcome, not a failure: the
 * backend refuses with `recent-login-required`, and the player is asked to sign in again instead of
 * being told something that did not happen.
 */
async function handleDeleteAccount() {
  const result = await deleteAccountNow();
  const removed = [
    result?.friendships ? `${result.friendships} friendship${result.friendships === 1 ? '' : 's'}` : '',
    result?.invites ? `${result.invites} invite${result.invites === 1 ? '' : 's'}` : '',
    result?.rooms ? `${result.rooms} room seat${result.rooms === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  navigate('home');
  showToast(removed.length ? `Account deleted. Also removed: ${removed.join(', ')}.` : 'Account deleted.', 'success');
}

function handleSettingsSubmit(form) {
  const formData = new FormData(form);
  const displayName = String(formData.get('displayName') || '').trim().slice(0, 20);
  state.displayName = displayName;
  try {
    localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, displayName);
  } catch {
    // Storage is optional; a blocked localStorage must not prevent settings from applying.
  }
  setSoundEnabled(formData.get('soundEnabled') === 'on');
  applyTheme(String(formData.get('theme') || 'system'), false);
  state.modal = null;
  render();
  showToast('Settings saved on this device.');
}

async function handleReviewSubmit(form) {
  const formData = new FormData(form);
  const payload = {
    rating: Number(formData.get('rating')),
    gameId: String(formData.get('gameId') || 'arcade'),
    title: String(formData.get('title') || ''),
    message: String(formData.get('message') || ''),
    reviewerName: String(formData.get('reviewerName') || ''),
  };
  state.reviewSubmitting = true;
  state.reviewModelStatus = 'Preparing the on-device model…';
  render();
  try {
    const result = await submitReview(payload, (message) => {
      if (state.reviewModelStatus === message) return;
      state.reviewModelStatus = message;
      render();
    });
    state.reviewSubmitting = false;
    state.reviewModelStatus = '';
    await Promise.all([
      loadPublicReviews({ reset: true }),
      loadFeaturedReview({ force: true }),
    ]);
    const modelNote = result.usedOnDeviceModel
      ? ' Sentiment was classified on your device.'
      : result.modelUnavailable
        ? ' The on-device model was unavailable, so the private local fallback handled it.'
        : '';
    showToast(`Your review is live. ${result.assistantName || 'The Arcade Review Agent'} replied.${modelNote}`, 'success');
  } catch (error) {
    state.reviewSubmitting = false;
    state.reviewModelStatus = '';
    render();
    throw error;
  }
}

/**
 * The maintenance page's tester-PIN form. Digits only, 16 long; the server makes the call.
 * On success the app opens for this visitor (a bypass token is stored on the device); on
 * failure the page stays and the error is shown inline (the toast system is behind the gate).
 */
async function handleMaintenancePinSubmit(form) {
  const pin = String(new FormData(form).get('pin') || '').trim();
  if (!/^[0-9]{16}$/.test(pin)) {
    state.maintenanceError = 'The tester PIN is exactly 16 digits.';
    render();
    return;
  }
  try {
    if (await verifyMaintenancePin(pin)) showToast('The doors are open - welcome back in.');
  } catch (error) {
    state.maintenanceError = friendlyError(error);
    render();
  }
}

/**
 * The admin studio's maintenance controls: one write through the `adminSetMaintenance`
 * callable, which validates the admin, caps the message and (when enabling) issues a fresh
 * 16-digit tester PIN that is shown here once and never stored on this device.
 */
async function handleAdminMaintenanceSubmit(form) {
  const formData = new FormData(form);
  await adminSetMaintenance(formData.get('enabled') === 'on', String(formData.get('message') || '').trim());
}

async function handleAdminGrantSubmit(form) {
  /** Granting by raw UID goes through the same confirm gate as the player-row button. */
  const uidToPromote = String(new FormData(form).get('uid') || '').trim();
  if (!uidToPromote) throw new Error('Paste a user UID first.');
  openAdminConfirm('Grant admin access?', `UID ${uidToPromote} gets the full control room: every room, player, link and admin flag. Only promote someone you trust completely.`, 'Grant access', () => adminGrantAccess(uidToPromote));
}

async function handleAuthSubmit(form) {
  if (!firebaseReady) throw setupError();
  state.authError = '';
  const formData = new FormData(form);
  const mode = formData.get('mode');
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  if (mode === 'register') {
    const current = authInstance.currentUser;
    const existingAccount = current && !current.isAnonymous && current.email === email && !state.profile;
    const credential = existingAccount
      ? { user: current }
      : await createUserWithEmailAndPassword(authInstance, email, password);
    await registerProfile(credential.user, String(formData.get('username') || ''));
    state.modal = null;
    showToast('Account ready. Go find your people.');
  } else {
    await signInWithEmailAndPassword(authInstance, email, password);
    state.modal = null;
    showToast('Welcome back to the arcade.');
  }
}

async function handleCreateRoomSubmit(form) {
  const formData = new FormData(form);
  const gameId = String(formData.get('gameId'));
  const maxPlayers = Number(formData.get('maxPlayers'));
  const displayName = String(formData.get('displayName') || '').trim();
  if (displayName) {
    state.displayName = displayName.slice(0, 20);
    localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, state.displayName);
  }
  await createOnlineRoom(gameId, maxPlayers, state.modal?.friend || null, state.displayName);
  state.modal = null;
  render();
}

function openRoomModal(gameId = GAMES[0].id, friend = null) {
  // When online play is unavailable the dialog itself explains why and keeps practice reachable.
  modalOpen({ type: 'room', gameId, friend });
}

/**
 * The admin studio's safety gate: a confirm dialog whose "do it" button runs `run` (a function
 * stored on the modal state, invoked by the `confirm-modal-run` action below).
 */
function openAdminConfirm(title, body, confirmLabel, run) {
  modalOpen({ type: 'confirm', title, body, confirmLabel, run });
}

/** One small linter-friendly wrapper: admin dataset attributes come in as possibly undefined. */
function adminArg(value = '') {
  return String(value || '');
}

function handleClick(event) {
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  const { gameId, page, category, index, col, uid, direction, choice, answer, lane, requestId, inviteId, roomId } = actionButton.dataset;
  if (action === 'reload') { location.reload(); return; }
  if (action === 'leave-room') { void leaveCurrentRoom(); return; }
  if (action === 'modal-backdrop' && event.target === actionButton) { modalClose(); return; }
  if (action === 'navigate') { navigate(page); return; }
  if (action === 'toggle-theme') { toggleTheme(); return; }
  if (action === 'skip-to-content') { const main = /** @type {HTMLElement | null} */ (document.querySelector('#page-content')); if (main) { main.setAttribute('tabindex', '-1'); main.focus(); } return; }
  if (action === 'open-settings') { modalOpen({ type: 'settings' }); return; }
  if (action === 'toggle-favorite') { toggleFavorite(gameId); return; }
  if (action === 'open-game') { recordRecentGame(gameId); modalOpen({ type: 'game', gameId }); return; }
  if (action === 'filter-category') { state.category = category; if (state.page !== 'catalog') { navigate('catalog'); return; } render(); return; }
  if (action === 'clear-filters') {
    state.query = '';
    state.category = 'All games';
    state.filters = { duration: 'Any length', difficulty: 'Any difficulty', input: 'Any input' };
    render();
    return;
  }
  if (action === 'quick-play') { const game = GAMES[Math.floor(Math.random() * GAMES.length)]; recordRecentGame(game.id); modalOpen({ type: 'game', gameId: game.id }); return; }
  if (action === 'quick-room') { openRoomModal(GAMES[0].id); return; }
  if (action === 'open-friends') { navigate('friends'); return; }
  if (action === 'open-report') {
    modalOpen({
      type: 'report',
      kind: 'other',
      targetUid: roomId ? '' : uid || '',
      targetName: actionButton.dataset.name || '',
      roomId: roomId || state.room?.id || '',
    });
    return;
  }
  if (action === 'block-player') {
    const blockedUid = adminArg(uid);
    const name = actionButton.dataset.name || 'this player';
    openAdminConfirm('Block this player?', `${name} disappears from your search results, and their requests and invites are refused and cleared. You can unblock them from the friends page.`, 'Block player', () => blockPlayer(blockedUid));
    return;
  }
  if (action === 'unblock-player') { void unblockPlayer(adminArg(uid)).catch((error) => showToast(friendlyError(error), 'warning')); return; }
  if (action === 'open-delete-account') {
    openAdminConfirm(
      'Delete this account?',
      'This deletes your profile, releases your username, removes your friendships, requests, invites and presence, and deletes the Firebase sign-in. Rooms still in play are left for the other players and expire on their own. This cannot be undone.',
      'Delete my account',
      () => handleDeleteAccount().catch((error) => {
        if (/** @type {any} */ (error)?.code === 'recent-login-required') {
          state.authError = friendlyError(error);
          modalOpen({ type: 'auth', mode: 'login' });
          showToast('Sign in again, then delete within 10 minutes.', 'warning');
          return;
        }
        throw error;
      }),
    );
    return;
  }
  if (action === 'show-setup') {
    if (!state.liveCheck?.running) state.liveCheck = null; // never show the result of an earlier, possibly outdated, check
    modalOpen({ type: 'setup' });
    return;
  }
  if (action === 'close-modal') { modalClose(); return; }
  if (action === 'practice-game') { startPractice(gameId); return; }
  if (action === 'create-room-for-game') { openRoomModal(gameId, state.modal?.friend || null); return; }
  if (action === 'copy-room-link') { void copyRoomLink(); return; }
  if (action === 'share-room-link') { void shareRoomLink(); return; }
  if (action === 'start-room') { void startRoom().catch((error) => showToast(friendlyError(error), 'warning')); return; }
  if (action === 'claim-host') {
    void claimHost()
      .then((changed) => { if (changed) showToast('You are the host now. Start when everyone is ready.'); })
      .catch((error) => showToast(friendlyError(error), 'warning'));
    return;
  }
  if (action === 'retry-room') { const route = parseHash(); state.roomError = ''; state.room = null; state.roomId = null; if (route.id) void openRoomFromLink(route.id); return; }
  if (action === 'leave-session') { routeBackToCatalog(); return; }
  if (action === 'play-again') { void resetCurrentGame(); return; }
  if (action === 'line-move') { void sendGameAction({ index: Number(index) }); return; }
  if (action === 'drop-move') { void sendGameAction({ col: Number(col) }); return; }
  if (action === 'memory-flip') { void sendGameAction({ index: Number(index) }); return; }
  if (action === 'race-tap') { void sendGameAction({ type: 'tap' }); return; }
  if (action === 'duel-choice') { void sendGameAction({ choice }); return; }
  if (action === 'quiz-answer') { void sendGameAction({ answer: Number(answer) }); return; }
  if (action === 'quiz-next') { void sendGameAction({ type: 'next' }); return; }
  if (action === 'maze-move') { void sendGameAction({ direction }); return; }
  if (action === 'battle-target') { state.selectedBattleTarget = uid; render(); return; }
  if (action === 'battle-fire') { void sendGameAction({ type: 'fire', targetUid: state.selectedBattleTarget, index: Number(index) }); return; }
  if (action === 'rally-hit') { void sendGameAction({ lane: Number(lane) }); return; }
  if (action === 'code-digit') {
    const digitIndex = Number(index);
    const symbols = Number(currentGameState()?.symbols) || 6;
    state.codeDraft[digitIndex] = (state.codeDraft[digitIndex] + 1) % symbols;
    render();
    return;
  }
  if (action === 'code-submit') {
    const digits = Number(currentGameState()?.digits) || 4;
    void sendGameAction({ guess: state.codeDraft.slice(0, digits) });
    state.codeDraft = [...DEFAULT_CODE_DRAFT];
    return;
  }
  if (action === 'open-auth') { modalOpen({ type: 'auth', mode: 'login' }); return; }
  if (action === 'open-username-setup') { modalOpen({ type: 'username', suggestion: suggestUsername(state.user?.displayName, state.user?.email) }); return; }
  if (action === 'google-sign-in') {
    void handleGoogleSignIn().catch((error) => reportAuthError(error, { method: 'google' }));
    return;
  }
  if (action === 'google-sign-in-existing') {
    void handleGoogleSignIn({ forceExistingAccount: true }).catch((error) => reportAuthError(error, { method: 'google' }));
    return;
  }
  if (action === 'run-live-check') { void runLiveCheck(); return; }
  if (action === 'account-menu') { modalOpen({ type: 'account' }); return; }
  if (action === 'sign-out') { void signOut(authInstance).then(() => { modalClose(); showToast('Signed out. Come back anytime.'); }); return; }
  if (action === 'auth-mode') { state.authError = ''; modalOpen({ type: 'auth', mode: actionButton.dataset.mode }); return; }
  if (action === 'guest-play') {
    state.authError = '';
    void ensureOnlineUser().then(() => { modalClose(); showToast('Guest mode is ready. Make a room or join a friend.'); }).catch((error) => reportAuthError(error, { method: 'anonymous' }));
    return;
  }
  if (action === 'notifications') { modalOpen({ type: 'notifications' }); return; }
  if (action === 'send-friend-request') { void sendFriendRequest(actionButton.dataset.name).catch((error) => showToast(friendlyError(error), 'warning')); void uid; return; }
  if (action === 'accept-friend' || action === 'decline-friend') { void respondToFriend(requestId, action === 'accept-friend').catch((error) => showToast(friendlyError(error), 'warning')); return; }
  if (action === 'join-game-invite') { void joinGameInvite(inviteId, roomId).catch((error) => showToast(friendlyError(error), 'warning')); return; }
  if (action === 'challenge-friend') {
    const friend = { uid, name: actionButton.dataset.name, friendshipId: actionButton.dataset.friendshipId };
    modalOpen({ type: 'room', gameId: GAMES[0].id, friend });
    return;
  }
  if (action === 'refresh-admin') { void loadAdminData(); return; }
  if (action === 'load-more-reviews') { void loadPublicReviews({ reset: false }); return; }
  if (action === 'admin-label-review') {
    void adminLabelReview(adminArg(actionButton.dataset.reviewId), adminArg(actionButton.dataset.label));
    return;
  }
  if (action === 'admin-train-review-agent') { void adminTrainReviewAgent(); return; }
  if (action === 'admin-tab') { state.adminTab = adminArg(actionButton.dataset.tab) || 'overview'; render(); return; }
  if (action === 'confirm-modal-run') {
    // The confirm modal carries its work as a function; close first so errors toast over the page.
    const run = state.modal?.type === 'confirm' ? state.modal.run : null;
    modalClose();
    if (typeof run === 'function') void Promise.resolve(run());
    return;
  }
  if (action === 'admin-delete-room') {
    openAdminConfirm('Delete this room?', `The room hosted by ${adminArg(actionButton.dataset.name)} and every heartbeat under it will be permanently deleted. Players inside will see the room vanish.`, 'Delete room', () => adminDeleteRoom(adminArg(roomId)));
    return;
  }
  if (action === 'admin-kick-player') {
    openAdminConfirm('Kick this player from the lobby?', `${adminArg(actionButton.dataset.name)} loses their seat immediately. If they were the host, the next player in line becomes the host.`, 'Kick player', () => adminKickPlayer(adminArg(roomId), adminArg(uid)));
    return;
  }
  if (action === 'admin-remove-player') {
    openAdminConfirm('Remove this player?', `@${adminArg(actionButton.dataset.name)}'s profile is deleted and their username is freed for anyone to claim. Their admin flag (if any) goes too. Their sign-in itself stays, but they become a plain guest.`, 'Remove player', () => adminRemovePlayer(adminArg(uid)));
    return;
  }
  if (action === 'admin-delete-friendship') {
    openAdminConfirm('Unlink these friends?', `${adminArg(actionButton.dataset.name)} will no longer see each other in friend lists. They can re-add later.`, 'Unlink friends', () => adminDeleteFriendship(adminArg(actionButton.dataset.friendshipId)));
    return;
  }
  if (action === 'admin-delete-request') {
    openAdminConfirm('Delete this friend request?', `The request ${adminArg(actionButton.dataset.name)} disappears from both inboxes.`, 'Delete request', () => adminDeleteFriendRequest(adminArg(requestId)));
    return;
  }
  if (action === 'admin-delete-invite') {
    openAdminConfirm('Delete this game invite?', `The ${adminArg(actionButton.dataset.name)} invite can no longer be accepted.`, 'Delete invite', () => adminDeleteGameInvite(adminArg(inviteId)));
    return;
  }
  if (action === 'admin-grant') {
    openAdminConfirm('Grant admin access?', `@${adminArg(actionButton.dataset.name)} gets the full control room: every room, player, link and admin flag. Only do this for yourself or someone you trust completely.`, 'Grant access', () => adminGrantAccess(uid));
    return;
  }
  if (action === 'admin-revoke') {
    openAdminConfirm('Revoke admin access?', `${adminArg(actionButton.dataset.name)} loses the studio on their next refresh. You can restore it anytime.`, 'Revoke access', () => adminRevokeAccess(adminArg(uid)));
    return;
  }
  if (action === 'admin-copy-uid') {
    const fullUid = adminArg(uid);
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(fullUid).then(() => showToast('UID copied to the clipboard.'), () => showToast(fullUid, 'warning'));
    } else {
      showToast(fullUid, 'warning');
    }
    return;
  }
}

async function resetCurrentGame() {
  if (state.modal?.type === 'result') state.modal = null;
  try {
    if (state.local) {
      const game = getGame(state.local.gameId);
      if (!game) throw new Error('This game is no longer in the catalog.');
      state.local.gameState = createInitialGameState(game, state.local.players, `${state.local.seed}:again:${Date.now()}`);
      state.codeDraft = [...DEFAULT_CODE_DRAFT];
      render();
      if (game.engine === 'race') startCpuRaceLoop(); else scheduleCpuMove();
      return;
    }
    if (!state.room || !state.user) return;
    // The backend re-checks the host, the room's status and its lifetime, and deals a fresh state
    // (with a fresh seed) that keeps the optimistic-action revisions monotonic.
    if (state.onlineActionsPending) throw new Error('Your last move is still syncing. The rematch will be ready in a moment.');
    await rematchRoom();
    state.codeDraft = [...DEFAULT_CODE_DRAFT];
  } catch (error) {
    showToast(friendlyError(error), 'warning');
  }
}

/** Leave the lobby: give the seat back while the room is waiting, then go back to the shelf. */
async function leaveCurrentRoom() {
  try {
    await leaveWaitingRoom();
  } catch (error) {
    showToast(friendlyError(error), 'warning');
  }
  navigate('catalog');
}

function handleSubmit(event) {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const type = form.dataset.form;
  const submitButton = form.querySelector('[type="submit"]');
  if (submitButton) { submitButton.disabled = true; submitButton.classList.add('is-loading'); }
  let task;
  if (type === 'create-room') task = handleCreateRoomSubmit(form);
  else if (type === 'auth') task = handleAuthSubmit(form);
  else if (type === 'username-setup') task = handleUsernameSetupSubmit(form);
  else if (type === 'admin-grant') task = handleAdminGrantSubmit(form);
  else if (type === 'admin-maintenance') task = handleAdminMaintenanceSubmit(form);
  else if (type === 'maintenance-pin') task = handleMaintenancePinSubmit(form);
  else if (type === 'settings') { handleSettingsSubmit(form); if (submitButton) submitButton.disabled = false; return; }
  else if (type === 'friend-search') { requestFriendSearch(form); if (submitButton) submitButton.disabled = false; return; }
  else if (type === 'join-code') task = handleJoinCodeSubmit(form);
  else if (type === 'report') task = handleReportSubmit(form);
  else if (type === 'review') task = handleReviewSubmit(form);
  Promise.resolve(task).catch((error) => {
    if (type === 'auth') reportAuthError(error, { method: 'password' });
    else showToast(friendlyError(error), 'warning');
    if (submitButton) { submitButton.disabled = false; submitButton.classList.remove('is-loading'); }
  });
}

function handleInput(event) {
  if (event.target.id === 'global-search') {
    state.query = event.target.value;
    if (state.page === 'home') {
      state.page = 'catalog';
      state.focusSearchAfterRoute = true;
      if (location.hash !== '#/catalog') location.hash = '#/catalog';
    }
    const grid = document.querySelector('#catalog-grid');
    if (grid) grid.innerHTML = renderGameGrid(filteredGames(), 2);
    const count = document.querySelector('.game-count b');
    if (count) count.textContent = String(filteredGames().length);
  }
}

/** The shelf filters: select changes repaint the grid and the count without a full re-render. */
function handleFilterChange(event) {
  const select = event.target.closest('select[data-filter]');
  if (!select) return;
  const key = select.dataset.filter;
  if (key !== 'duration' && key !== 'difficulty' && key !== 'input') return;
  state.filters = { ...state.filters, [key]: select.value };
  render();
}

/**
 * Arrow keys inside the admin tablist move the selection, as a `role="tablist"` promises.
 * Returns true when the key was consumed.
 */
function handleTabKeys(event) {
  const tab = event.target?.closest?.('[role="tab"][data-action="admin-tab"]');
  if (!tab || event.altKey || event.ctrlKey || event.metaKey) return false;
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return false;
  const tabs = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('[role="tab"][data-action="admin-tab"]')]);
  const index = tabs.indexOf(/** @type {HTMLElement} */ (tab));
  if (index === -1 || !tabs.length) return false;
  const next = event.key === 'Home' ? 0
    : event.key === 'End' ? tabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  const tabId = tabs[next]?.dataset.tab;
  if (!tabId) return false;
  state.adminTab = tabId;
  render();
  /** @type {HTMLElement | null} */ (document.querySelector(`[role="tab"][data-tab="${tabId}"]`))?.focus();
  return true;
}

function handleKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    const search = /** @type {HTMLInputElement | null} */ (document.querySelector('#global-search'));
    search?.focus();
    search?.select();
    return;
  }
  if (event.key === 'Escape' && state.modal) { modalClose(); return; }
  if (!state.modal && handleTabKeys(event)) { event.preventDefault(); return; }
  if (state.modal && trapDialogTab(event)) return;
  if (!state.modal && !event.altKey && !event.ctrlKey && !event.metaKey && handleBoardArrows(event)) { event.preventDefault(); return; }
  if (state.page === 'game' && !state.modal && !event.altKey && !event.ctrlKey && !event.metaKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '')) {
    // Number and letter keys answer a quiz (1-4 or A-D) or pick a rally lane (1-5); they press the same buttons a tap would.
    const engine = currentGame()?.engine;
    const digit = /^[1-4]$/.test(event.key) ? Number(event.key) - 1 : 'abcd'.indexOf(event.key.toLowerCase());
    if (engine === 'quiz' && event.key.length === 1 && digit >= 0) {
      const option = /** @type {HTMLButtonElement | undefined} */ ([...document.querySelectorAll('.quiz-option')][digit]);
      if (option && !option.disabled) { event.preventDefault(); option.click(); return; }
    }
    if (engine === 'rally' && /^[1-5]$/.test(event.key)) {
      const lane = /** @type {HTMLButtonElement | null} */ (document.querySelector(`[data-action="rally-hit"][data-lane="${Number(event.key) - 1}"]`));
      if (lane && !lane.disabled) { event.preventDefault(); lane.click(); return; }
    }
  }
  if (state.page === 'game' && currentGame()?.engine === 'maze' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    const direction = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[event.key];
    void sendGameAction({ direction });
  }
  if (state.page === 'game' && currentGame()?.engine === 'race' && event.code === 'Space' && !['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement?.tagName ?? '')) {
    event.preventDefault();
    void sendGameAction({ type: 'tap' });
  }
}

function attachAppEvents() {
  // index.html without #app: nothing to attach to, and render() is a no-op for the same reason.
  if (!appRoot) return;
  appRoot.addEventListener('click', handleClick);
  appRoot.addEventListener('submit', handleSubmit);
  appRoot.addEventListener('input', handleInput);
  appRoot.addEventListener('change', handleFilterChange);
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('hashchange', routeFromHash);
  // Broken artwork must never leave a hole: the capture phase sees the image's error event, marks the
  // <img> and the CSS shows a labelled placeholder instead. (Inline onerror is blocked by the CSP.)
  window.addEventListener('error', (event) => {
    const image = /** @type {HTMLImageElement | null} */ (event.target);
    if (!image || image.tagName !== 'IMG' || image.dataset.broken) return;
    image.dataset.broken = '1';
    image.classList.add('is-broken');
  }, true);
}

attachAppEvents();
applyTheme(state.themePreference);
window.addEventListener('online', () => {
  state.online = true;
  render();
  // A room listener that failed while the connection was gone does not recover on its own, so the
  // invite is replayed as soon as the browser is back. Joining is idempotent: if you are already in
  // the room, openRoomFromLink just re-attaches the listener.
  if (state.roomId && (state.roomError || !state.room)) void openRoomFromLink(state.roomId);
});
window.addEventListener('offline', () => { state.online = false; render(); });
const themeMedia = window.matchMedia?.('(prefers-color-scheme: light)');
themeMedia?.addEventListener?.('change', () => {
  if (state.themePreference === 'system') applyTheme('system', true);
});
try {
  // The collaborators are resolved here, before the mode check, so a name that is not imported
  // fails in local practice mode (and in the jsdom tests) too - not only on a deployment.
  // `initializeMaintenance` runs its cached part synchronously (a returning visitor mid-
  // maintenance is gated before the first paint, with no network), then re-checks the flag in
  // the background - the first paint must never wait on it, and it never rejects: a flag that
  // cannot be read leaves the arcade open (fail open).
  void initializeMaintenance().catch((error) => {
    console.error('[PSD-gaming] The maintenance check failed; the arcade stays open:', error);
  });
  boot({
    firebaseReady,
    routeFromHash,
    watchAuth: (onUser) => onAuthStateChanged(authInstance, onUser),
    refreshAccount,
    processGoogleRedirect,
    reportAuthError,
  });
} catch (error) {
  // A start-up bug must never leave the page blank: draw the shell and keep the error readable.
  console.error('[PSD-gaming] Start-up failed; drawing the page anyway:', error);
  routeFromHash();
}
