import {
  GAMES,
  applyGameAction,
  createInitialGameState,
  getGame,
  getQuizQuestion,
} from './catalog.js';
import {
  state,
  currentGame,
} from './state.js';
import { isGoogleUser } from './ui/players.js';
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
  routeFromHash,
  setHash,
} from './router.js';
import {
  joinGameInvite,
  requestFriendSearch,
  respondToFriend,
  sendFriendRequest,
  subscribeSocial,
} from './social.js';
import { loadAdminData } from './online/admin.js';
import {
  createOnlineRoom,
  doOnlineAction,
  openRoomFromLink,
  startRoom,
} from './online/rooms.js';
import { showToast } from './ui/toast.js';
import {
  connection,
  setupError,
} from './connection.js';
import {
  filteredGames,
  renderGameGrid,
} from './views/pages.js';
import {
  auth,
  createGoogleProvider,
  db,
  firebaseReady,
} from './firebase.js';

import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  linkWithPopup,
  linkWithRedirect,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import {
  DISPLAY_NAME_STORAGE_KEY,
  SOUND_STORAGE_KEY,
  nextToggledTheme,
  recordRecentGameId,
  resolveTheme,
  saveThemePreference,
  suggestUsername,
  toggleFavoriteGameId,
  validateUsername,
} from './helpers.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

/** A no-op unsubscribe, so the `stop*` variables are always safe to call. */
const emptyUnsubscribe = () => {};

let toastTimer = 0;

function systemPrefersLight() {
  return Boolean(window.matchMedia?.('(prefers-color-scheme: light)').matches);
}

function applyTheme(preference = state.themePreference, shouldRender = false) {
  state.themePreference = saveThemePreference(preference);
  state.resolvedTheme = resolveTheme(state.themePreference, systemPrefersLight());
  document.documentElement.dataset.theme = state.resolvedTheme;
  document.documentElement.style.colorScheme = state.resolvedTheme;
  const themeMeta = document.querySelector('#meta-theme-color');
  if (themeMeta) themeMeta.setAttribute('content', state.resolvedTheme === 'light' ? '#f3f7ff' : '#07152d');
  if (shouldRender) render();
}

function toggleTheme() {
  applyTheme(nextToggledTheme(state.resolvedTheme), true);
  showToast(`${state.resolvedTheme === 'light' ? 'Light' : 'Dark'} theme selected.`);
}

function setSoundEnabled(enabled) {
  state.soundEnabled = Boolean(enabled);
  try { localStorage.setItem(SOUND_STORAGE_KEY, String(state.soundEnabled)); } catch {}
}

function playUiTone(kind = 'tap') {
  if (!state.soundEnabled || !window.AudioContext) return;
  try {
    const context = new window.AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = kind === 'win' ? 660 : kind === 'error' ? 180 : 420;
    gain.gain.setValueAtTime(0.018, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.08);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.09);
    oscillator.addEventListener('ended', () => void context.close(), { once: true });
  } catch {
    // Audio is a progressive enhancement; never block a game move.
  }
}

function recordRecentGame(gameId) {
  state.recentGames = recordRecentGameId(state.recentGames, gameId, new Set(GAMES.map((game) => game.id)), 8, localStorage);
}

function toggleFavorite(gameId) {
  state.favorites = toggleFavoriteGameId(state.favorites, gameId, new Set(GAMES.map((game) => game.id)), localStorage);
  const game = getGame(gameId);
  showToast(`${game?.title || 'Game'} ${state.favorites.includes(gameId) ? 'added to favorites' : 'removed from favorites'}.`);
}

async function finishGoogleAuthentication(user, successMessage = 'Google sign-in confirmed.') {
  state.user = user;
  state.authError = '';
  await refreshAccount(user);
  if (state.profile) {
    state.modal = null;
    showToast(successMessage);
  } else if (isGoogleUser(user)) {
    state.modal = {
      type: 'username',
      suggestion: suggestUsername(user.displayName, user.email),
    };
    render();
  }
}

async function redirectGoogleSignIn({ linkGuest = false } = {}) {
  const provider = createGoogleProvider();
  state.authError = '';
  showToast('Opening Google sign-in…', 'success');
  if (linkGuest && auth.currentUser?.isAnonymous) {
    await linkWithRedirect(auth.currentUser, provider);
  } else {
    await signInWithRedirect(auth, provider);
  }
}

async function handleGoogleSignIn({ forceExistingAccount = false } = {}) {
  if (!firebaseReady) throw setupError();
  state.authError = '';
  const current = auth.currentUser || state.user;
  const shouldLink = !forceExistingAccount && Boolean(current?.isAnonymous);
  const provider = createGoogleProvider();
  try {
    const result = shouldLink
      ? await linkWithPopup(current, provider)
      : await signInWithPopup(auth, provider);
    await finishGoogleAuthentication(result.user, shouldLink ? 'Google linked — your guest identity is preserved.' : 'Welcome to the arcade with Google.');
  } catch (error) {
    if (error?.code === 'auth/credential-already-in-use') {
      state.modal = { type: 'google-conflict' };
      render();
      return;
    }
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(error?.code)) {
      try {
        await redirectGoogleSignIn({ linkGuest: shouldLink });
      } catch (redirectError) {
        throw redirectError;
      }
      return;
    }
    throw error;
  }
}

async function processGoogleRedirect() {
  if (!firebaseReady || state.redirectChecked) return;
  state.redirectChecked = true;
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      await finishGoogleAuthentication(result.user, 'Google sign-in confirmed.');
    }
  } catch (error) {
    if (error?.code === 'auth/credential-already-in-use') {
      state.modal = { type: 'google-conflict' };
      render();
    } else if (error?.code !== 'auth/popup-closed-by-user') {
      // Firebase only touches the network here when a sign-in redirect was actually pending, so this error
      // belongs to that sign-in attempt: keep it for the sign-in dialog as well as showing a toast.
      state.authError = friendlyError(error, { method: 'google' });
      showToast(state.authError, 'warning');
    }
  }
}

async function registerProfile(user, rawUsername) {
  const validation = validateUsername(rawUsername);
  if (!validation.ok) throw new Error(validation.error);
  const { username, usernameLower } = validation;
  const profileRef = doc(db, 'profiles', user.uid);
  const usernameRef = doc(db, 'usernames', usernameLower);
  await runTransaction(db, async (transaction) => {
    const claim = await transaction.get(usernameRef);
    if (claim.exists()) throw new Error('That username is already taken. Try another one.');
    transaction.set(usernameRef, { uid: user.uid, username, createdAt: serverTimestamp() });
    transaction.set(profileRef, { uid: user.uid, username, usernameLower, createdAt: serverTimestamp() });
  });
  state.profile = { uid: user.uid, username, usernameLower };
  state.displayName = username;
  localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, username);
  await refreshAdminStatus(user);
  subscribeSocial(user);
}

async function refreshAdminStatus(user) {
  state.isAdmin = false;
  if (!user || user.isAnonymous || !firebaseReady) return;
  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    state.isAdmin = adminSnap.exists() && adminSnap.data().admin === true;
  } catch (error) {
    console.warn('[PSD-gaming] Admin lookup was denied:', error?.message);
  }
}

async function refreshAccount(user) {
  state.user = user;
  state.profile = null;
  state.isAdmin = false;
  state.requests = [];
  state.friends = [];
  state.invites = [];
  state.socialError = '';
  stopRequests(); stopFriends(); stopInvites();
  stopRequests = emptyUnsubscribe; stopFriends = emptyUnsubscribe; stopInvites = emptyUnsubscribe;
  if (user && !user.isAnonymous && firebaseReady) {
    try {
      const profileSnap = await getDoc(doc(db, 'profiles', user.uid));
      if (profileSnap.exists()) {
        state.profile = profileSnap.data();
      } else if (isGoogleUser(user) && (!state.modal || state.modal.type === 'auth')) {
        state.modal = {
          type: 'username',
          suggestion: suggestUsername(user.displayName, user.email),
        };
      }
      await refreshAdminStatus(user);
      subscribeSocial(user);
    } catch (error) {
      console.warn('[PSD-gaming] Account profile could not be loaded:', error?.message);
      state.socialError = `Your profile and friends could not be loaded. ${friendlyError(error)}`;
    }
  }
  render();
  if (state.socialError) showToast(state.socialError, 'warning');
  if (state.page === 'admin' && !state.isAdmin) navigate('home');
  const route = parseHash();
  if (route.page === 'room' && route.id && user) void openRoomFromLink(route.id);
}

function startPractice(gameId) {
  const game = getGame(gameId);
  if (!game) return;
  recordRecentGame(gameId);
  const players = [
    { uid: 'local-you', name: 'You' },
    { uid: 'local-cpu', name: 'CPU rival' },
  ];
  const seed = `practice-${gameId}-${Date.now()}`;
  state.local = { gameId, players, gameState: createInitialGameState(game, players, seed), seed };
  state.room = null;
  state.roomId = null;
  state.page = 'game';
  state.modal = null;
  state.selectedBattleTarget = 'local-cpu';
  state.codeDraft = [0, 0, 0, 0];
  if (location.hash !== '#/game') location.hash = '#/game';
  render();
  if (game.engine === 'race') startCpuRaceLoop();
  else scheduleCpuMove();
}

function localMove(uid, action) {
  if (!state.local) return;
  try {
    const game = getGame(state.local.gameId);
    const next = applyGameAction(game, state.local.gameState, uid, action, state.local.players);
    state.local.gameState = next;
    playUiTone(next.phase === 'finished' ? 'win' : 'tap');
    render();
    if (game.engine !== 'race') scheduleCpuMove();
  } catch (error) {
    showToast(friendlyError(error), 'warning');
  }
}

async function sendGameAction(action) {
  if (state.local) {
    localMove('local-you', action);
    return;
  }
  try {
    await doOnlineAction(action);
    playUiTone('tap');
  } catch (error) {
    playUiTone('error');
    showToast(friendlyError(error), 'warning');
  }
}

function scheduleCpuMove() {
  if (!state.local || state.cpuPending || getGame(state.local.gameId)?.engine === 'race') return;
  const game = getGame(state.local.gameId);
  const gameState = state.local.gameState;
  const cpu = state.local.players[1];
  if (gameState.phase !== 'playing') return;
  const shouldMove = ['rps', 'quiz', 'maze'].includes(game.engine)
    ? !Object.hasOwn(gameState.answers || gameState.picks || {}, cpu.uid) || game.engine === 'maze'
    : gameState.turnUid === cpu.uid;
  if (!shouldMove) return;
  state.cpuPending = true;
  const delay = game.engine === 'memory' && gameState.opened.length === 1 ? 780 : 620;
  state.cpuTimer = window.setTimeout(() => {
    state.cpuPending = false;
    if (!state.local) return;
    const current = state.local.gameState;
    if (current.phase !== 'playing') return;
    const action = chooseCpuAction(game, current, state.local.players);
    if (action) localMove(cpu.uid, action);
  }, delay);
}

function startCpuRaceLoop() {
  window.clearTimeout(state.cpuTimer);
  const loop = () => {
    if (!state.local || getGame(state.local.gameId)?.engine !== 'race' || state.local.gameState.phase !== 'playing') return;
    localMove('local-cpu', { type: 'tap' });
    state.cpuTimer = window.setTimeout(loop, 690 + Math.random() * 500);
  };
  state.cpuTimer = window.setTimeout(loop, 850);
}

function chooseCpuAction(game, gameState, players) {
  const cpu = players[1];
  const random = (max) => Math.floor(Math.random() * max);
  switch (game.engine) {
    case 'line': {
      const open = gameState.board.map((cell, index) => cell === null ? index : -1).filter((index) => index >= 0);
      return open.length ? { index: open[random(open.length)] } : null;
    }
    case 'drop': {
      const open = Array.from({ length: gameState.cols }, (_, index) => index).filter((col) => gameState.board[col] === null);
      return open.length ? { col: open[random(open.length)] } : null;
    }
    case 'memory': {
      const open = gameState.opened.length >= 2 ? [] : gameState.opened;
      const hidden = gameState.cards.map((_, index) => index).filter((index) => !gameState.matched.includes(index) && !open.includes(index));
      if (!hidden.length) return null;
      if (open.length === 1) {
        const match = hidden.find((index) => gameState.cards[index] === gameState.cards[open[0]]);
        if (match !== undefined && Math.random() > 0.18) return { index: match };
      }
      return { index: hidden[random(hidden.length)] };
    }
    case 'rps': {
      const choice = gameState.mode === 'rps' ? ['rock', 'paper', 'scissors'][random(3)] : gameState.mode === 'coin' ? ['heads', 'tails'][random(2)] : String(random(6) + 1);
      return { choice };
    }
    case 'quiz': {
      if (Object.hasOwn(gameState.answers, cpu.uid)) return null;
      const question = getQuizQuestion(gameState.questionIndex);
      return { answer: Math.random() > 0.3 ? question.answer : random(question.choices.length) };
    }
    case 'maze': {
      const { x, y } = gameState.positions[cpu.uid];
      const options = [
        ['up', x, y - 1], ['left', x - 1, y], ['right', x + 1, y], ['down', x, y + 1],
      ].filter(([, nextX, nextY]) => nextX >= 0 && nextX < gameState.width && nextY >= 0 && nextY < gameState.height && !gameState.walls.includes(nextY * gameState.width + nextX));
      options.sort((a, b) => Math.abs(a[1] - gameState.goal.x) + Math.abs(a[2] - gameState.goal.y) - (Math.abs(b[1] - gameState.goal.x) + Math.abs(b[2] - gameState.goal.y)));
      const move = options[0];
      return move ? { direction: move[0] } : null;
    }
    case 'battle': {
      if (gameState.turnUid !== cpu.uid) return null;
      const target = players.find((player) => player.uid !== cpu.uid);
      if (!target) return null;
      const used = new Set(gameState.shots[cpu.uid].filter((key) => key.startsWith(`${target.uid}:`)).map((key) => Number(key.split(':')[1])));
      const available = Array.from({ length: gameState.boardSize ** 2 }, (_, index) => index).filter((index) => !used.has(index));
      return available.length ? { targetUid: target.uid, index: available[random(available.length)] } : null;
    }
    case 'rally':
      return gameState.turnUid === cpu.uid ? { lane: random(3) } : null;
    case 'code':
      return gameState.turnUid === cpu.uid ? { guess: Array.from({ length: gameState.digits }, () => random(6)) } : null;
    default:
      return null;
  }
}

function routeBackToCatalog() {
  window.clearTimeout(state.cpuTimer);
  state.cpuPending = false;
  state.local = null;
  state.modal = null;
  navigate('catalog');
}

function formatGameLink(roomId = state.room?.id) {
  return `${location.origin}${location.pathname}#/room/${roomId}`;
}

async function copyRoomLink() {
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

async function shareRoomLink() {
  if (!state.room?.id) return copyRoomLink();
  const url = formatGameLink();
  if (navigator.share) {
    try {
      await navigator.share({ title: `${getGame(state.room.gameId)?.title || 'PSD-gaming'} room`, text: 'Join my PSD-gaming room.', url });
      showToast('Invite shared.');
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  await copyRoomLink();
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

function withTimeout(promise, ms, message) {
  let timer = 0;
  const timeout = new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

/** Explicit, user-started check against the real Firebase project this build is configured for. */
async function runLiveCheck() {
  if (!connection().onlineFeatures || state.liveCheck?.running) return;
  state.liveCheck = { running: true, steps: [] };
  render();
  const steps = [];
  try {
    await auth.authStateReady();
    const hadUser = Boolean(auth.currentUser);
    const user = await withTimeout(ensureOnlineUser(), 15000, 'Signing in took longer than 15 seconds. Check your connection and try again.');
    steps.push({
      ok: true,
      label: 'Firebase Auth is reachable and accepted the API key',
      detail: hadUser
        ? 'Already signed in, so no new sign-in was attempted (the Anonymous provider was not re-tested).'
        : 'Signed in as a guest, so the Anonymous provider is enabled.',
    });
    try {
      await withTimeout(getDoc(doc(db, 'admins', user.uid)), 15000, 'Firestore did not answer within 15 seconds. Check that the Firestore database exists and your connection works.');
      steps.push({ ok: true, label: 'Firestore is reachable and the rules are published', detail: 'Read your own admins/{uid} document, which firestore.rules allows for any signed-in user.' });
    } catch (error) {
      steps.push({ ok: false, label: 'Firestore check failed', detail: friendlyError(error) });
    }
  } catch (error) {
    steps.push({ ok: false, label: 'Firebase Auth check failed', detail: friendlyError(error, { method: 'anonymous' }) });
  }
  state.liveCheck = { running: false, steps };
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
    const existingAccount = auth.currentUser && !auth.currentUser.isAnonymous && auth.currentUser.email === email && !state.profile;
    const credential = existingAccount
      ? { user: auth.currentUser }
      : await createUserWithEmailAndPassword(auth, email, password);
    await registerProfile(credential.user, String(formData.get('username') || ''));
    state.modal = null;
    showToast('Account ready. Go find your people.');
  } else {
    await signInWithEmailAndPassword(auth, email, password);
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
  if (action === 'modal-backdrop' && event.target === actionButton) { modalClose(); return; }
  if (action === 'navigate') { navigate(page); return; }
  if (action === 'toggle-theme') { toggleTheme(); return; }
  if (action === 'open-settings') { modalOpen({ type: 'settings' }); return; }
  if (action === 'toggle-favorite') { toggleFavorite(gameId); return; }
  if (action === 'open-game') { recordRecentGame(gameId); modalOpen({ type: 'game', gameId }); return; }
  if (action === 'filter-category') { state.category = category; render(); return; }
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
  if (action === 'sign-out') { void signOut(auth).then(() => { modalClose(); showToast('Signed out. Come back anytime.'); }); return; }
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
      state.local.gameState = createInitialGameState(game, state.local.players, `${state.local.seed}:again:${Date.now()}`);
      state.codeDraft = [0, 0, 0, 0];
      render();
      if (game.engine === 'race') startCpuRaceLoop(); else scheduleCpuMove();
      return;
    }
    if (!state.room || !state.user) return;
    if (state.room.hostUid !== state.user.uid) throw new Error('Only the room host can reset the game.');
    await runTransaction(db, async (transaction) => {
      const roomRef = doc(db, 'rooms', state.room.id);
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
    const search = document.querySelector('#global-search');
    search?.focus();
    search?.select();
    return;
  }
  if (event.key === 'Escape' && state.modal) { modalClose(); return; }
  if (state.page === 'game' && currentGame()?.engine === 'maze' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    const direction = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[event.key];
    void sendGameAction({ direction });
  }
  if (state.page === 'game' && currentGame()?.engine === 'race' && event.code === 'Space' && !['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement?.tagName)) {
    event.preventDefault();
    void sendGameAction({ type: 'tap' });
  }
}

function attachAppEvents() {
  appRoot.addEventListener('click', handleClick);
  appRoot.addEventListener('submit', handleSubmit);
  appRoot.addEventListener('input', handleInput);
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('hashchange', routeFromHash);
}

attachAppEvents();
applyTheme(state.themePreference);
window.addEventListener('online', () => { state.online = true; render(); });
window.addEventListener('offline', () => { state.online = false; render(); });
const themeMedia = window.matchMedia?.('(prefers-color-scheme: light)');
themeMedia?.addEventListener?.('change', () => {
  if (state.themePreference === 'system') applyTheme('system', true);
});
if (firebaseReady) {
  onAuthStateChanged(auth, (user) => { void refreshAccount(user); });
  void processGoogleRedirect().finally(() => routeFromHash());
} else {
  routeFromHash();
}
