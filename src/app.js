/**
 * App wiring: event handlers and module coordination.
 * This is the central event bus — click, submit, input, keydown, hashchange.
 */

import { GAMES, getGame, createInitialGameState } from './catalog.js';
import { state, currentGame, currentGameState, DEFAULT_CODE_DRAFT } from './state.js';
import { boot } from './boot.js';
import { scheduleCpuMove, sendGameAction, startCpuRaceLoop, startPractice } from './cpu.js';
import { deleteAccountNow, handleGoogleSignIn, processGoogleRedirect, refreshAccount, registerProfile } from './accounts.js';
import { applyTheme, toggleTheme } from './ui/theme.js';
import { setSoundEnabled } from './ui/sound.js';
import { recordRecentGame, toggleFavorite } from './ui/prefs.js';
import { copyRoomLink, shareRoomLink } from './ui/links.js';
import { appRoot, render } from './render.js';
import { friendlyError, reportAuthError } from './errors.js';
import { ensureOnlineUser } from './online/session.js';
import { navigate, parseHash, routeFromHash } from './router.js';
import { blockPlayer, joinGameInvite, reportProblem, requestFriendSearch, respondToFriend, sendFriendRequest, unblockPlayer } from './social.js';
import { adminDeleteRoom, adminDeleteFriendRequest, adminDeleteFriendship, adminDeleteGameInvite, adminLabelReview, adminTrainReviewAgent, adminGrantAccess, adminKickPlayer, adminRemovePlayer, adminRevokeAccess, loadAdminData } from './online/admin.js';
import { loadFeaturedReview, loadPublicReviews, submitReview } from './reviews.js';
import { applyMaintenanceCache, clearMaintenancePass, disableMaintenance, enableMaintenance, loadMaintenanceAccess, refreshMaintenance, rotateMaintenancePin, saveMaintenanceReason, setMaintenancePreview, submitMaintenancePin } from './maintenance.js';
import { MAINTENANCE_PIN_DEFAULT_HOURS, MAINTENANCE_PIN_DIGITS, MAINTENANCE_REASON_MAX, formatMaintenancePin, normalizeMaintenancePin } from '../shared/online/maintenance.js';
import { claimHost, createOnlineRoom, joinRoomByCode, leaveWaitingRoom, openRoomFromLink, rematchRoom, startRoom } from './online/rooms.js';
import { sendChatMessage, toggleChatPanel } from './online/chat.js';
import { showToast } from './ui/toast.js';
import { setupError } from './connection.js';
import { filteredGames, renderGameGrid } from './views/pages.js';
import { auth, firebaseReady } from './firebase.js';
import { handleBoardArrows, trapDialogTab } from './a11y.js';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { DISPLAY_NAME_STORAGE_KEY, suggestUsername } from './helpers.js';

const authInstance = /** @type {any} */ (auth);

/* ── Helpers ────────────────────────────────────────────────────────────── */

function routeBackToCatalog() {
  clearTimeout(state.cpuTimer);
  state.cpuPending = false;
  state.local = null;
  state.modal = null;
  navigate('catalog');
}

function modalOpen(modal) { state.modal = modal; render(); }
function modalClose() { state.modal = null; state.authError = ''; render(); }

function openAdminConfirm(title, body, confirmLabel, run) {
  modalOpen({ type: 'confirm', title, body, confirmLabel, run });
}

function adminArg(value = '') { return String(value || ''); }

/* ── Form Handlers ──────────────────────────────────────────────────────── */

async function handleAuthSubmit(form) {
  if (!firebaseReady) throw setupError();
  state.authError = '';
  const fd = new FormData(form);
  const mode = fd.get('mode');
  const email = String(fd.get('email') || '').trim();
  const password = String(fd.get('password') || '');
  if (mode === 'register') {
    const current = authInstance.currentUser;
    const existing = current && !current.isAnonymous && current.email === email && !state.profile;
    const cred = existing ? { user: current } : await createUserWithEmailAndPassword(authInstance, email, password);
    await registerProfile(cred.user, String(fd.get('username') || ''));
    state.modal = null;
    showToast('Account ready. Go find your people.');
  } else {
    await signInWithEmailAndPassword(authInstance, email, password);
    state.modal = null;
    showToast('Welcome back to the arcade.');
  }
}

async function handleCreateRoomSubmit(form) {
  const fd = new FormData(form);
  const displayName = String(fd.get('displayName') || '').trim();
  if (displayName) { state.displayName = displayName.slice(0, 20); localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, state.displayName); }
  await createOnlineRoom(String(fd.get('gameId')), Number(fd.get('maxPlayers')), state.modal?.friend || null, state.displayName);
  state.modal = null;
  render();
}

async function handleUsernameSetupSubmit(form) {
  if (!firebaseReady || !state.user || state.user.isAnonymous) throw new Error('Sign in first.');
  const username = String(new FormData(form).get('username') || '').trim();
  await registerProfile(state.user, username);
  state.modal = null;
  render();
  showToast(`Welcome, @${username}. Friend features are ready.`);
}

async function handleJoinCodeSubmit(form) {
  const code = String(new FormData(form).get('code') || '').trim();
  await joinRoomByCode(code);
  showToast('Room found. Settling you in…');
}

async function handleReportSubmit(form) {
  const fd = new FormData(form);
  const m = state.modal?.type === 'report' ? state.modal : {};
  const result = await reportProblem({ kind: String(fd.get('kind') || 'other'), message: String(fd.get('message') || ''), targetUid: m.targetUid || '', roomId: m.roomId || '' });
  state.modal = null;
  render();
  showToast(`Report stored for the operator.`, 'success');
}

async function handleDeleteAccount() {
  const result = await deleteAccountNow();
  navigate('home');
  showToast('Account deleted.', 'success');
}

function handleSettingsSubmit(form) {
  const fd = new FormData(form);
  state.displayName = String(fd.get('displayName') || '').trim().slice(0, 20);
  try { localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, state.displayName); } catch { /* ignore */ }
  setSoundEnabled(fd.get('soundEnabled') === 'on');
  applyTheme(String(fd.get('theme') || 'system'), false);
  state.modal = null;
  render();
  showToast('Settings saved.');
}

async function handleReviewSubmit(form) {
  const fd = new FormData(form);
  state.reviewSubmitting = true;
  state.reviewModelStatus = 'Preparing…';
  render();
  try {
    const result = await submitReview({ rating: Number(fd.get('rating')), gameId: String(fd.get('gameId') || 'arcade'), title: String(fd.get('title') || ''), message: String(fd.get('message') || ''), reviewerName: String(fd.get('reviewerName') || '') });
    state.reviewSubmitting = false;
    state.reviewModelStatus = '';
    await Promise.all([loadPublicReviews({ reset: true }), loadFeaturedReview({ force: true })]);
    showToast(`Your review is live!`, 'success');
  } catch (error) { state.reviewSubmitting = false; state.reviewModelStatus = ''; render(); throw error; }
}

/* ── Click Handler ──────────────────────────────────────────────────────── */

function handleClick(event) {
  const btn = event.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const { gameId, page, category, index, col, uid, direction, choice, answer, lane, requestId, inviteId, roomId } = btn.dataset;

  if (action === 'reload') { location.reload(); return; }
  if (action === 'navigate') { navigate(page); return; }
  if (action === 'toggle-theme') { toggleTheme(); return; }
  if (action === 'open-settings') { modalOpen({ type: 'settings' }); return; }
  if (action === 'toggle-favorite') { toggleFavorite(gameId); return; }
  if (action === 'open-game') { recordRecentGame(gameId); modalOpen({ type: 'game', gameId }); return; }
  if (action === 'filter-category') { state.category = category; if (state.page !== 'catalog') { navigate('catalog'); return; } render(); return; }
  if (action === 'clear-filters') { state.query = ''; state.category = 'All games'; state.filters = { duration: 'Any length', difficulty: 'Any difficulty', input: 'Any input' }; render(); return; }
  if (action === 'quick-play') { const game = GAMES[Math.floor(Math.random() * GAMES.length)]; recordRecentGame(game.id); modalOpen({ type: 'game', gameId: game.id }); return; }
  if (action === 'quick-room') { modalOpen({ type: 'room', gameId: GAMES[0].id }); return; }
  if (action === 'open-report') { modalOpen({ type: 'report', kind: 'other', targetUid: uid || '', roomId: roomId || state.room?.id || '' }); return; }
  if (action === 'block-player') { openAdminConfirm('Block this player?', 'Their requests and invites will be refused.', 'Block', () => blockPlayer(adminArg(uid))); return; }
  if (action === 'unblock-player') { void unblockPlayer(adminArg(uid)).catch(e => showToast(friendlyError(e), 'warning')); return; }
  if (action === 'open-delete-account') { openAdminConfirm('Delete this account?', 'This cannot be undone.', 'Delete my account', () => handleDeleteAccount().catch(e => { if (e?.code === 'recent-login-required') { state.authError = friendlyError(e); modalOpen({ type: 'auth', mode: 'login' }); } else throw e; })); return; }
  if (action === 'show-setup') { modalOpen({ type: 'setup' }); return; }
  if (action === 'close-modal') { modalClose(); return; }
  if (action === 'practice-game') { startPractice(gameId); return; }
  if (action === 'create-room-for-game') { modalOpen({ type: 'room', gameId, friend: state.modal?.friend || null }); return; }
  if (action === 'copy-room-link') { void copyRoomLink(); return; }
  if (action === 'share-room-link') { void shareRoomLink(); return; }
  if (action === 'start-room') { void startRoom().catch(e => showToast(friendlyError(e), 'warning')); return; }
  if (action === 'claim-host') { void claimHost().then(changed => { if (changed) showToast('You are the host now.'); }).catch(e => showToast(friendlyError(e), 'warning')); return; }
  if (action === 'toggle-chat') { toggleChatPanel(); return; }
  if (action === 'leave-room') { void leaveWaitingRoom().catch(e => showToast(friendlyError(e), 'warning')); navigate('catalog'); return; }
  if (action === 'retry-room') { const route = parseHash(); state.roomError = ''; state.room = null; if (route.id) void openRoomFromLink(route.id); return; }
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
  if (action === 'code-digit') { const di = Number(index); const symbols = Number(currentGameState()?.symbols) || 6; state.codeDraft[di] = (state.codeDraft[di] + 1) % symbols; render(); return; }
  if (action === 'code-submit') { const digits = Number(currentGameState()?.digits) || 4; void sendGameAction({ guess: state.codeDraft.slice(0, digits) }); state.codeDraft = [...DEFAULT_CODE_DRAFT]; return; }
  if (action === 'open-auth') { modalOpen({ type: 'auth', mode: 'login' }); return; }
  if (action === 'open-username-setup') { modalOpen({ type: 'username', suggestion: suggestUsername(state.user?.displayName, state.user?.email) }); return; }
  if (action === 'google-sign-in') { void handleGoogleSignIn().catch(e => reportAuthError(e, { method: 'google' })); return; }
  if (action === 'run-live-check') { import('./diagnostics.js').then(m => m.runLiveCheck()); return; }
  if (action === 'account-menu') { modalOpen({ type: 'account' }); return; }
  if (action === 'sign-out') { void signOut(authInstance).then(() => { modalClose(); showToast('Signed out.'); }); return; }
  if (action === 'auth-mode') { state.authError = ''; modalOpen({ type: 'auth', mode: btn.dataset.mode }); return; }
  if (action === 'guest-play') { state.authError = ''; void ensureOnlineUser().then(() => { modalClose(); showToast('Guest mode ready.'); }).catch(e => reportAuthError(e, { method: 'anonymous' })); return; }
  if (action === 'send-friend-request') { void sendFriendRequest(btn.dataset.name).catch(e => showToast(friendlyError(e), 'warning')); return; }
  if (action === 'accept-friend' || action === 'decline-friend') { void respondToFriend(requestId, action === 'accept-friend').catch(e => showToast(friendlyError(e), 'warning')); return; }
  if (action === 'join-game-invite') { void joinGameInvite(inviteId, roomId).catch(e => showToast(friendlyError(e), 'warning')); return; }
  if (action === 'challenge-friend') { modalOpen({ type: 'room', gameId: GAMES[0].id, friend: { uid, name: btn.dataset.name, friendshipId: btn.dataset.friendshipId } }); return; }
  if (action === 'refresh-admin') { void loadAdminData(); return; }
  if (action === 'admin-delete-room') { openAdminConfirm('Delete this room?', 'This cannot be undone.', 'Delete', () => adminDeleteRoom(adminArg(roomId))); return; }
  if (action === 'admin-kick-player') { openAdminConfirm('Kick this player?', 'They lose their seat.', 'Kick', () => adminKickPlayer(adminArg(roomId), adminArg(uid))); return; }
  if (action === 'admin-remove-player') { openAdminConfirm('Remove this player?', 'Their profile is deleted.', 'Remove', () => adminRemovePlayer(adminArg(uid))); return; }
  if (action === 'admin-grant') { openAdminConfirm('Grant admin access?', 'Full control room.', 'Grant', () => adminGrantAccess(uid)); return; }
  if (action === 'admin-revoke') { openAdminConfirm('Revoke admin access?', 'They lose the studio.', 'Revoke', () => adminRevokeAccess(adminArg(uid))); return; }
  if (action === 'admin-copy-uid') { const fullUid = adminArg(uid); if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(fullUid).then(() => showToast('UID copied.')); else showToast(fullUid, 'warning'); return; }
  if (action === 'admin-tab') { state.adminTab = adminArg(btn.dataset.tab) || 'overview'; render(); return; }
  if (action === 'admin-label-review') { void adminLabelReview(adminArg(btn.dataset.reviewId), adminArg(btn.dataset.label)); return; }
  if (action === 'admin-train-review-agent') { void adminTrainReviewAgent(); return; }
  if (action === 'load-more-reviews') { void loadPublicReviews({ reset: false }); return; }
  if (action === 'confirm-modal-run') { const run = state.modal?.type === 'confirm' ? state.modal.run : null; modalClose(); if (typeof run === 'function') void Promise.resolve(run()); return; }
  if (action === 'maintenance-open-studio') { state.adminTab = 'maintenance'; navigate('admin'); return; }
  if (action === 'maintenance-off') { openAdminConfirm('Open the arcade again?', 'Visitors get the live site.', 'Open the site', () => disableMaintenance()); return; }
}

async function resetCurrentGame() {
  if (state.modal?.type === 'result') state.modal = null;
  try {
    if (state.local) {
      const game = getGame(state.local.gameId);
      if (!game) throw new Error('Game not found.');
      state.local.gameState = createInitialGameState(game, state.local.players, `${state.local.seed}:again:${Date.now()}`);
      state.codeDraft = [...DEFAULT_CODE_DRAFT];
      render();
      if (game.engine === 'race') startCpuRaceLoop(); else scheduleCpuMove();
      return;
    }
    if (!state.room || !state.user) return;
    if (state.onlineActionsPending) throw new Error('Your last move is still syncing.');
    await rematchRoom();
    state.codeDraft = [...DEFAULT_CODE_DRAFT];
  } catch (error) { showToast(friendlyError(error), 'warning'); }
}

/* ── Submit Handler ──────────────────────────────────────────────────────── */

function handleSubmit(event) {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const type = form.dataset.form;
  const btn = form.querySelector('[type="submit"]');
  if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
  let task;
  if (type === 'create-room') task = handleCreateRoomSubmit(form);
  else if (type === 'auth') task = handleAuthSubmit(form);
  else if (type === 'username-setup') task = handleUsernameSetupSubmit(form);
  else if (type === 'settings') { handleSettingsSubmit(form); if (btn) btn.disabled = false; return; }
  else if (type === 'friend-search') { requestFriendSearch(form); if (btn) btn.disabled = false; return; }
  else if (type === 'join-code') task = handleJoinCodeSubmit(form);
  else if (type === 'report') task = handleReportSubmit(form);
  else if (type === 'review') task = handleReviewSubmit(form);
  else if (type === 'chat') { const input = form.querySelector('input[name="text"]'); const text = String(new FormData(form).get('text') || ''); task = sendChatMessage(text).then(() => { if (input) input.value = ''; }); }
  Promise.resolve(task).catch(error => {
    if (type === 'auth') reportAuthError(error, { method: 'password' });
    else showToast(friendlyError(error), 'warning');
    if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
  });
}

/* ── Input Handler ───────────────────────────────────────────────────────── */

function handleInput(event) {
  if (event.target.id === 'global-search') {
    state.query = event.target.value;
    if (state.page === 'home') { state.page = 'catalog'; state.focusSearchAfterRoute = true; if (location.hash !== '#/catalog') location.hash = '#/catalog'; }
    const grid = document.querySelector('#catalog-grid');
    if (grid) grid.innerHTML = renderGameGrid(filteredGames(), 2);
    const count = document.querySelector('.game-count b');
    if (count) count.textContent = String(filteredGames().length);
  }
}

function handleFilterChange(event) {
  const select = event.target.closest('select[data-filter]');
  if (!select) return;
  const key = select.dataset.filter;
  if (key !== 'duration' && key !== 'difficulty' && key !== 'input') return;
  state.filters = { ...state.filters, [key]: select.value };
  render();
}

/* ── Keydown Handler ─────────────────────────────────────────────────────── */

function handleKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    const search = document.querySelector('#global-search');
    search?.focus(); search?.select();
    return;
  }
  if (event.key === 'Escape' && state.modal) { modalClose(); return; }
  if (state.modal && trapDialogTab(event)) return;
  if (!state.modal && !event.altKey && !event.ctrlKey && !event.metaKey && handleBoardArrows(event)) { event.preventDefault(); return; }

  // Quiz shortcuts
  if (state.page === 'game' && !state.modal && currentGame()?.engine === 'quiz' && /^[1-4a-d]$/i.test(event.key)) {
    const digit = /^[1-4]$/.test(event.key) ? Number(event.key) - 1 : 'abcd'.indexOf(event.key.toLowerCase());
    const option = [...document.querySelectorAll('.quiz-option')][digit];
    if (option && !option.disabled) { event.preventDefault(); option.click(); return; }
  }

  // Rally lane shortcuts
  if (state.page === 'game' && currentGame()?.engine === 'rally' && /^[1-5]$/.test(event.key)) {
    const lane = document.querySelector(`[data-action="rally-hit"][data-lane="${Number(event.key) - 1}"]`);
    if (lane && !lane.disabled) { event.preventDefault(); lane.click(); return; }
  }

  // Maze arrow keys
  if (state.page === 'game' && currentGame()?.engine === 'maze' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    const direction = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[event.key];
    void sendGameAction({ direction });
  }

  // Race spacebar
  if (state.page === 'game' && currentGame()?.engine === 'race' && event.code === 'Space' && !['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement?.tagName ?? '')) {
    event.preventDefault();
    void sendGameAction({ type: 'tap' });
  }
}

/* ── Attach Events ───────────────────────────────────────────────────────── */

function attachAppEvents() {
  if (!appRoot) return;
  appRoot.addEventListener('click', handleClick);
  appRoot.addEventListener('submit', handleSubmit);
  appRoot.addEventListener('input', handleInput);
  appRoot.addEventListener('change', handleFilterChange);
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('hashchange', routeFromHash);
  window.addEventListener('error', (event) => {
    const img = event.target;
    if (!img || img.tagName !== 'IMG' || img.dataset.broken) return;
    img.dataset.broken = '1';
    img.classList.add('is-broken');
  }, true);
}

attachAppEvents();
applyTheme(state.themePreference);

window.addEventListener('online', () => { state.online = true; render(); if (state.roomId && (state.roomError || !state.room)) void openRoomFromLink(state.roomId); });
window.addEventListener('offline', () => { state.online = false; render(); });

const themeMedia = window.matchMedia?.('(prefers-color-scheme: light)');
themeMedia?.addEventListener?.('change', () => { if (state.themePreference === 'system') applyTheme('system', true); });

applyMaintenanceCache();

try {
  const started = boot({
    firebaseReady,
    routeFromHash,
    watchAuth: (onUser) => onAuthStateChanged(authInstance, onUser),
    refreshAccount,
    processGoogleRedirect,
    reportAuthError,
  });
  import('./maintenance.js').then(({ startMaintenanceWatch }) => {
    void started.then(startMaintenanceWatch, startMaintenanceWatch);
  }).catch(() => {
    // Maintenance module unavailable — continue without it
  });
} catch (error) {
  console.error('[PSD-gaming] Start-up failed; drawing the page anyway:', error);
  routeFromHash();
}