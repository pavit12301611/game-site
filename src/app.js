import {
  GAMES,
  createInitialGameState,
  getGame,
} from './catalog.js';
import {
  state,
  currentGame,
} from './state.js';
import { boot } from './boot.js';
import { runLiveCheck } from './diagnostics.js';
import { scheduleCpuMove, sendGameAction, startCpuRaceLoop, startPractice } from './cpu.js';
import {
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
  joinGameInvite,
  requestFriendSearch,
  respondToFriend,
  sendFriendRequest,
} from './social.js';
import { loadAdminData } from './online/admin.js';
import {
  createOnlineRoom,
  leaveWaitingRoom,
  openRoomFromLink,
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
  db,
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
import {
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';

/**
 * `auth` and `db` are null only when Firebase never started. Every use below sits behind a
 * `firebaseReady` check, or behind a sign-in or a room that can only exist with Firebase running,
 * so these casts state what those guards already guarantee (the same pattern as src/accounts.js).
 */
const authInstance = /** @type {import('firebase/auth').Auth} */ (auth);
const store = /** @type {import('firebase/firestore').Firestore} */ (db);

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

function handleSettingsSubmit(form) {
  const formData = new FormData(form);
  const displayName = String(formData.get('displayName') || '').trim().slice(0, 20);
  state.displayName = displayName;
  try { localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, displayName); } catch {}
  setSoundEnabled(formData.get('soundEnabled') === 'on');
  applyTheme(String(formData.get('theme') || 'system'), false);
  state.modal = null;
  render();
  showToast('Settings saved on this device.');
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

function handleClick(event) {
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  const { gameId, page, category, index, col, uid, direction, choice, answer, lane, targetUid, requestId, inviteId, roomId } = actionButton.dataset;
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
  if (action === 'clear-filters') { state.query = ''; state.category = 'All games'; render(); return; }
  if (action === 'quick-play') { const game = GAMES[Math.floor(Math.random() * GAMES.length)]; recordRecentGame(game.id); modalOpen({ type: 'game', gameId: game.id }); return; }
  if (action === 'quick-room') { openRoomModal(GAMES[0].id); return; }
  if (action === 'open-friends') { navigate('friends'); return; }
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
  if (action === 'code-digit') { const digitIndex = Number(index); state.codeDraft[digitIndex] = (state.codeDraft[digitIndex] + 1) % 6; render(); return; }
  if (action === 'code-submit') { void sendGameAction({ guess: [...state.codeDraft] }); state.codeDraft = [0, 0, 0, 0]; return; }
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
  if (action === 'send-friend-request') { void sendFriendRequest(uid, actionButton.dataset.name).catch((error) => showToast(friendlyError(error), 'warning')); return; }
  if (action === 'accept-friend' || action === 'decline-friend') { void respondToFriend(requestId, action === 'accept-friend').catch((error) => showToast(friendlyError(error), 'warning')); return; }
  if (action === 'join-game-invite') { void joinGameInvite(inviteId, roomId).catch((error) => showToast(friendlyError(error), 'warning')); return; }
  if (action === 'challenge-friend') {
    const friend = { uid, name: actionButton.dataset.name, friendshipId: actionButton.dataset.friendshipId };
    modalOpen({ type: 'room', gameId: GAMES[0].id, friend });
    return;
  }
  if (action === 'refresh-admin') { void loadAdminData(); return; }
}

async function resetCurrentGame() {
  try {
    if (state.local) {
      const game = getGame(state.local.gameId);
      if (!game) throw new Error('This game is no longer in the catalog.');
      state.local.gameState = createInitialGameState(game, state.local.players, `${state.local.seed}:again:${Date.now()}`);
      state.codeDraft = [0, 0, 0, 0];
      render();
      if (game.engine === 'race') startCpuRaceLoop(); else scheduleCpuMove();
      return;
    }
    if (!state.room || !state.user) return;
    if (state.room.hostUid !== state.user.uid) throw new Error('Only the room host can reset the game.');
    const roomId = state.room.id;
    await runTransaction(store, async (transaction) => {
      const roomRef = doc(store, 'rooms', roomId);
      const snapshot = await transaction.get(roomRef);
      if (!snapshot.exists()) throw new Error('The room no longer exists.');
      const room = snapshot.data();
      const players = room.playerUids.map((uid) => ({ uid, name: room.playerNames?.[uid] || 'Player' }));
      transaction.update(roomRef, { state: createInitialGameState(room.gameId, players, `${room.id}:${Date.now()}`), status: 'playing', updatedAt: serverTimestamp() });
    });
    state.codeDraft = [0, 0, 0, 0];
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
  else if (type === 'settings') { handleSettingsSubmit(form); if (submitButton) submitButton.disabled = false; return; }
  else if (type === 'friend-search') { requestFriendSearch(form); if (submitButton) submitButton.disabled = false; return; }
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
    if (grid) grid.innerHTML = renderGameGrid(filteredGames());
    const count = document.querySelector('.game-count b');
    if (count) count.textContent = String(filteredGames().length);
  }
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
  if (state.modal && trapDialogTab(event)) return;
  if (!state.modal && !event.altKey && !event.ctrlKey && !event.metaKey && handleBoardArrows(event)) { event.preventDefault(); return; }
  if (state.page === 'game' && !state.modal && !event.altKey && !event.ctrlKey && !event.metaKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '')) {
    // Number and letter keys answer a quiz (1-4 or A-D) or pick a rally lane (1-3); they press the same buttons a tap would.
    const engine = currentGame()?.engine;
    const digit = /^[1-4]$/.test(event.key) ? Number(event.key) - 1 : 'abcd'.indexOf(event.key.toLowerCase());
    if (engine === 'quiz' && event.key.length === 1 && digit >= 0) {
      const option = /** @type {HTMLButtonElement | undefined} */ ([...document.querySelectorAll('.quiz-option')][digit]);
      if (option && !option.disabled) { event.preventDefault(); option.click(); return; }
    }
    if (engine === 'rally' && /^[1-3]$/.test(event.key)) {
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
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('hashchange', routeFromHash);
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
  void boot({
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
