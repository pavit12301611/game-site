import {
  CATEGORIES,
  GAMES,
  GAME_COVERS,
  applyGameAction,
  createInitialGameState,
  getGame,
  getGameArtwork,
  getGameGuide,
  getQuizQuestion,
} from './catalog.js';
import { state, currentGame, currentGameState, currentPlayers, currentUid } from './state.js';
import { esc, icon } from './ui/html.js';
import { activeName, isGoogleUser, playerIndex, playerMark } from './ui/players.js';
import { connection, onlineUnavailableNote, setupError } from './connection.js';
import { renderEngineBoard } from './views/boards.js';
import {
  filteredGames,
  renderAdmin,
  renderCatalog,
  renderFriends,
  renderGameGrid,
  renderGameScreen,
  renderHome,
  renderRoom,
} from './views/pages.js';
import { auth, createGoogleProvider, db, firebaseReady, firebaseSetup } from './firebase.js';
import { describeConnection } from './connection-status.js';
import { describeFirebaseError, withErrorContext } from './firebase-errors.js';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  linkWithPopup,
  linkWithRedirect,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import {
  DISPLAY_NAME_STORAGE_KEY,
  FAVORITES_STORAGE_KEY,
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
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

/* global __PSD_BUILD__ */
// Injected by vite.config.js (`define`): where and when this bundle was built. Never contains config values.
const BUILD_INFO = typeof __PSD_BUILD__ === 'undefined'
  ? { mode: 'unknown', vercelEnv: '', commit: '', builtAt: '' }
  : __PSD_BUILD__;

const appRoot = document.querySelector('#app');
const emptyUnsubscribe = () => {};

let stopRoom = emptyUnsubscribe;
let stopRequests = emptyUnsubscribe;
let stopFriends = emptyUnsubscribe;
let stopInvites = emptyUnsubscribe;
let roomOpening = '';
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





function parseHash() {
  const path = location.hash.replace(/^#\/?/, '') || 'home';
  const [page, id] = path.split('/');
  return { page, id };
}

function setHash(path) {
  const nextHash = `#/${path}`;
  if (location.hash === nextHash) routeFromHash();
  else location.hash = nextHash;
}

function stopActiveRoom() {
  stopRoom();
  stopRoom = emptyUnsubscribe;
  state.room = null;
  state.roomId = null;
  state.roomError = '';
  roomOpening = '';
}

function routeFromHash() {
  const { page, id } = parseHash();
  const validPages = ['home', 'catalog', 'friends', 'admin', 'room', 'game'];
  const nextPage = validPages.includes(page) ? page : 'home';
  if (nextPage === 'room' && id) {
    state.page = 'room';
    state.local = null;
    render();
    if (firebaseReady) void openRoomFromLink(id);
    return;
  }
  stopActiveRoom();
  if (nextPage !== 'game') state.local = null;
  state.page = nextPage;
  render();
  if (state.focusSearchAfterRoute) {
    state.focusSearchAfterRoute = false;
    requestAnimationFrame(() => {
      const search = document.querySelector('#global-search');
      search?.focus();
      search?.setSelectionRange(search.value.length, search.value.length);
    });
  }
  if (nextPage === 'admin' && state.isAdmin) void loadAdminData();
}

function navigate(page) {
  if (page === 'admin' && !state.isAdmin) {
    showToast('The admin area is only available to approved accounts.', 'warning');
    return;
  }
  if (page !== 'room') stopActiveRoom();
  if (page !== 'game') state.local = null;
  state.page = page;
  if (location.hash !== `#/${page}`) location.hash = `#/${page}`;
  render();
  if (page === 'admin') void loadAdminData();
}

function setToast(message, kind = 'success') {
  state.toast = { message, kind };
  window.clearTimeout(toastTimer);
  render();
  // Warnings carry setup/diagnostic instructions, so they stay long enough to be read.
  const visibleFor = kind === 'warning' ? Math.min(10000, Math.max(5200, String(message).length * 55)) : 3400;
  toastTimer = window.setTimeout(() => {
    state.toast = null;
    render();
  }, visibleFor);
}

function showToast(message, kind = 'success') {
  setToast(message, kind);
}

function friendlyError(error, context = {}) {
  return describeFirebaseError(error, { online: navigator.onLine !== false, hostname: location.hostname, ...context });
}
function playerDisplayName(user = state.user) {
  if (state.profile?.username && user?.uid === state.user?.uid) return state.profile.username;
  if (state.displayName.trim()) return state.displayName.trim().slice(0, 20);
  if (user?.displayName) return user.displayName;
  return user?.isAnonymous ? `Guest ${user.uid.slice(0, 4)}` : 'Arcade player';
}

async function ensureOnlineUser() {
  if (!firebaseReady) throw setupError();
  await auth.authStateReady();
  if (auth.currentUser) {
    state.user = auth.currentUser;
    return auth.currentUser;
  }
  try {
    const result = await signInAnonymously(auth);
    state.user = result.user;
    return result.user;
  } catch (error) {
    throw withErrorContext(error, { method: 'anonymous' });
  }
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

function subscribeSocial(user) {
  if (!firebaseReady || !user || user.isAnonymous) return;
  stopRequests(); stopFriends(); stopInvites();
  stopRequests = onSnapshot(query(collection(db, 'friendRequests'), where('toUid', '==', user.uid)), (snapshot) => {
    state.requests = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.status === 'pending');
    render();
  }, (error) => reportSocialError('Friend request listener', error));
  stopFriends = onSnapshot(query(collection(db, 'friendships'), where('memberUids', 'array-contains', user.uid)), (snapshot) => {
    state.friends = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    render();
  }, (error) => reportSocialError('Friend list listener', error));
  stopInvites = onSnapshot(query(collection(db, 'gameInvites'), where('toUid', '==', user.uid)), (snapshot) => {
    state.invites = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.status === 'pending');
    render();
  }, (error) => reportSocialError('Game invite listener', error));
}

function reportSocialError(source, error) {
  console.warn(`[PSD-gaming] ${source}:`, error?.message);
  const message = `Friends and invites could not be loaded. ${friendlyError(error)}`;
  if (state.socialError === message) return;
  state.socialError = message;
  render();
}

function subscribeToRoom(roomId) {
  stopRoom();
  state.roomId = roomId;
  state.roomError = '';
  stopRoom = onSnapshot(doc(db, 'rooms', roomId), (snapshot) => {
    if (!snapshot.exists()) {
      state.room = null;
      state.roomError = 'This invite room no longer exists.';
    } else {
      state.room = { id: snapshot.id, ...snapshot.data() };
      state.roomError = '';
      if (state.room.gameId && !getGame(state.room.gameId)) state.roomError = 'This room points to a game that is not in the catalog.';
    }
    render();
  }, (error) => {
    state.roomError = friendlyError(error);
    render();
  });
}

async function openRoomFromLink(roomId) {
  if (roomOpening === roomId || state.roomId === roomId && state.room) return;
  roomOpening = roomId;
  try {
    const user = await ensureOnlineUser();
    const roomRef = doc(db, 'rooms', roomId);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(roomRef);
      if (!snapshot.exists()) throw new Error('This invite link is invalid or has expired.');
      const room = snapshot.data();
      const uids = room.playerUids || [];
      if (uids.includes(user.uid)) return;
      if (room.status !== 'waiting') throw new Error('This match has already started. Ask the host for a new room.');
      if (uids.length >= room.maxPlayers) throw new Error('This room is full. Ask the host for another invite.');
      const name = playerDisplayName(user);
      const nextUids = [...uids, user.uid];
      const nextNames = { ...(room.playerNames || {}), [user.uid]: name };
      const nextPlayers = nextUids.map((uid, index) => ({ uid, name: nextNames[uid] || `Player ${index + 1}` }));
      transaction.update(roomRef, {
        playerUids: nextUids,
        playerNames: nextNames,
        state: createInitialGameState(room.gameId, nextPlayers, room.id),
        updatedAt: serverTimestamp(),
      });
    });
    subscribeToRoom(roomId);
  } catch (error) {
    state.roomError = friendlyError(error);
    render();
  } finally {
    roomOpening = '';
  }
}

async function createOnlineRoom(gameId, maxPlayers = 2, friend = null, chosenName = '') {
  const game = getGame(gameId);
  if (!game) throw new Error('Choose one of the games in the catalog.');
  const user = await ensureOnlineUser();
  if (![2, 3].includes(Number(maxPlayers))) throw new Error('Choose a room size of 2 or 3 players.');
  const name = chosenName.trim().slice(0, 20) || playerDisplayName(user);
  state.displayName = name;
  localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, name);
  const roomRef = doc(collection(db, 'rooms'));
  const initialPlayers = [{ uid: user.uid, name }];
  const gameState = createInitialGameState(game, initialPlayers, roomRef.id);
  await setDoc(roomRef, {
    hostUid: user.uid,
    hostName: name,
    gameId,
    playerUids: [user.uid],
    playerNames: { [user.uid]: name },
    maxPlayers: Number(maxPlayers),
    status: 'waiting',
    state: gameState,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (friend?.uid) {
    const inviteRef = doc(collection(db, 'gameInvites'));
    await setDoc(inviteRef, {
      fromUid: user.uid,
      toUid: friend.uid,
      fromName: name,
      toName: friend.name,
      friendshipId: friend.friendshipId,
      roomId: roomRef.id,
      gameId,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  }
  state.local = null;
  state.page = 'room';
  state.roomError = '';
  if (location.hash !== `#/room/${roomRef.id}`) location.hash = `#/room/${roomRef.id}`;
  subscribeToRoom(roomRef.id);
}

async function startRoom() {
  if (!state.room || !state.user) return;
  if (state.room.hostUid !== state.user.uid) throw new Error('Only the host can start this room.');
  if ((state.room.playerUids || []).length < 2) throw new Error('Invite at least one friend before starting.');
  await updateDoc(doc(db, 'rooms', state.room.id), { status: 'playing', updatedAt: serverTimestamp() });
}

async function doOnlineAction(action) {
  if (!state.room || !state.user) throw new Error('Join a room before making a move.');
  const roomRef = doc(db, 'rooms', state.room.id);
  const user = state.user;
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) throw new Error('The room was closed.');
    const room = snapshot.data();
    const players = (room.playerUids || []).map((uid, index) => ({ uid, name: room.playerNames?.[uid] || `Player ${index + 1}` }));
    if (!players.some((player) => player.uid === user.uid)) throw new Error('You are no longer in this room.');
    const game = getGame(room.gameId);
    const nextState = applyGameAction(game, room.state, user.uid, action, players);
    transaction.update(roomRef, { state: nextState, updatedAt: serverTimestamp() });
  });
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

/** Sign-in errors stay visible inside the sign-in dialog; anywhere else they are a toast. */
function reportAuthError(error, context = {}) {
  const message = friendlyError(error, context);
  if (state.modal?.type === 'auth') {
    state.authError = message;
    render();
  } else {
    showToast(message, 'warning');
  }
}



function renderBrand() {
  return `<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M8 15 14 7h12l6 8-2 17H10z" fill="white"/><path d="M9 16h22l-2 8H11z" fill="#071c38"/><path d="M17 28h6" stroke="#57d9ff" stroke-width="2" stroke-linecap="round"/></svg></span>`;
}

function renderSidebar() {
  const conn = connection();
  const items = [
    { page: 'home', icon: 'home', label: 'Home' },
    { page: 'catalog', icon: 'grid', label: 'Game library', count: '40' },
    { page: 'friends', icon: 'people', label: 'Friends', count: state.requests.length || null },
  ];
  if (state.isAdmin) items.push({ page: 'admin', icon: 'shield', label: 'Admin studio' });
  return `<aside class="sidebar">
    <a class="brand-lockup" href="#/home" data-action="navigate" data-page="home" aria-label="PSD-gaming home">${renderBrand()}<span><b>PSD</b><small>GAMING</small></span><i>™</i></a>
    <div class="side-caption">YOUR ARCADE</div>
    <nav class="side-nav" aria-label="Main navigation">${items.map((item) => `<button class="nav-item ${state.page === item.page ? 'is-active' : ''}" data-action="navigate" data-page="${item.page}">${icon(item.icon)}<span>${item.label}</span>${item.count ? `<b class="nav-count">${item.count}</b>` : ''}</button>`).join('')}</nav>
    <div class="sidebar-divider"></div>
    <div class="side-caption">QUICK PLAY</div>
    <button class="nav-item" data-action="quick-play">${icon('spark')}<span>Surprise me</span><span class="nav-key">↵</span></button>
    <div class="sidebar-promo">
      <div class="promo-glyph">${icon('gamepad')}</div><span class="eyebrow">FRIENDS, NOT DISTANCE</span>
      <p>One link is all it takes to meet at the arcade.</p>
      <button class="text-button" data-action="open-friends">Find your crew ${icon('arrow')}</button>
    </div>
    <div class="sidebar-bottom" title="${esc(conn.title)}">
      <div class="connection-dot is-${conn.kind}"></div><span>${esc(conn.label)}</span>
    </div>
  </aside>`;
}

function renderTopbar() {
  const conn = connection();
  const name = state.profile?.username || (state.user?.isAnonymous ? 'Guest player' : 'Welcome, player');
  const unread = state.requests.length + state.invites.length;
  const themeLabel = state.resolvedTheme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
  return `<header class="topbar">
    <div class="topbar-mobile-brand">${renderBrand()}<b>PSD<span>-GAMING</span></b></div>
    <label class="search-box">${icon('search')}<input id="global-search" type="search" placeholder="Search 40 arcade games..." value="${esc(state.query)}" aria-label="Search the game library" /><kbd>⌘ K</kbd></label>
    <div class="topbar-actions">
      <span class="network-status is-${conn.kind}" title="${esc(conn.title)}"><i></i><span>${esc(conn.shortLabel)}</span></span>
      <button class="icon-button theme-toggle" data-action="toggle-theme" aria-label="${themeLabel}" title="${themeLabel}">${icon(state.resolvedTheme === 'light' ? 'moon' : 'sun')}</button>
      <button class="icon-button notification-button" data-action="notifications" aria-label="Notifications">${icon('bell')}${unread ? `<i>${unread > 9 ? '9+' : unread}</i>` : ''}</button>
      ${state.user ? `<button class="profile-button" data-action="account-menu"><span class="avatar ${state.user.isAnonymous ? 'avatar-guest' : ''}">${esc((state.profile?.username || state.user.email || 'G').slice(0, 1).toUpperCase())}</span><span class="profile-copy"><b>${esc(name)}</b><small>${state.user.isAnonymous ? 'Playing as a guest' : 'Arcade member'}</small></span><span class="profile-chevron">⌄</span></button>` : `<button class="button button-quiet top-signin" data-action="open-auth">Sign in</button>`}
    </div>
  </header>`;
}

function renderMobileNav() {
  const items = [
    ['home', 'Home', 'home'], ['catalog', 'Games', 'grid'], ['friends', 'Friends', 'people'],
  ];
  if (state.isAdmin) items.push(['admin', 'Admin', 'shield']);
  const pageItems = items.map(([page, label, iconName]) => `<button class="mobile-nav-item ${state.page === page ? 'is-active' : ''}" data-action="navigate" data-page="${page}">${icon(iconName)}<span>${label}</span></button>`).join('');
  return `<nav class="mobile-nav has-settings ${state.isAdmin ? 'has-admin' : ''}" aria-label="Mobile navigation">${pageItems}<button class="mobile-nav-item" data-action="open-settings">${icon('settings')}<span>Settings</span></button></nav>`;
}

function renderShell() {
  const pageNames = { home: 'Welcome back', catalog: 'Game library', friends: 'Your crew', admin: 'Admin studio', room: 'Private room', game: 'Now playing' };
  return `<div class="app-shell">${renderSidebar()}<div class="main-column">${renderTopbar()}<div class="page-context"><span class="context-dot"></span>${pageNames[state.page] || 'Arcade'}<span class="context-divider">/</span><span>${state.page === 'home' ? 'Play together, anywhere' : state.page === 'catalog' ? '40 browser-ready games' : state.page === 'friends' ? 'Good games are better shared' : state.page === 'admin' ? 'Your arcade, your rules' : state.page === 'room' ? 'Invite-only multiplayer' : 'No downloads, no distance'}</span></div><main class="page-content" id="page-content">${renderPage()}</main></div>${renderMobileNav()}</div>${state.modal ? renderModal() : ''}${state.toast ? `<div class="toast toast-${state.toast.kind}" role="status">${icon(state.toast.kind === 'success' ? 'check' : 'spark')}<span>${esc(state.toast.message)}</span></div>` : ''}`;
}

function renderPage() {
  switch (state.page) {
    case 'catalog': return renderCatalog();
    case 'friends': return renderFriends();
    case 'admin': return renderAdmin();
    case 'room': return renderRoom();
    case 'game': return renderGameScreen();
    default: return renderHome();
  }
}

async function loadAdminData() {
  if (!firebaseReady || !state.isAdmin || !state.user) return;
  state.adminLoading = true;
  render();
  try {
    const [roomsSnap, profilesSnap, friendsSnap] = await Promise.all([
      getDocs(query(collection(db, 'rooms'), orderBy('createdAt', 'desc'), limit(50))),
      getDocs(query(collection(db, 'profiles'), limit(200))),
      getDocs(query(collection(db, 'friendships'), limit(200))),
    ]);
    state.adminData = {
      rooms: roomsSnap.docs.map((item) => ({ id: item.id, ...item.data() })),
      profiles: profilesSnap.size,
      friendships: friendsSnap.size,
    };
  } catch (error) {
    state.adminData = { error: friendlyError(error), rooms: [], profiles: 0, friendships: 0 };
  }
  state.adminLoading = false;
  render();
}

function describeBuild() {
  const parts = [BUILD_INFO.vercelEnv || BUILD_INFO.mode];
  if (BUILD_INFO.commit) parts.push(BUILD_INFO.commit);
  if (BUILD_INFO.builtAt) parts.push(`built ${BUILD_INFO.builtAt.replace('T', ' ').slice(0, 16)} UTC`);
  return parts.join(' · ');
}

function renderConnectionCheck(conn) {
  const configState = firebaseSetup.status === 'ok' ? 'Loaded' : firebaseSetup.status === 'missing' ? 'Missing' : 'Invalid';
  const rows = [
    ['Status', conn.label],
    ['Firebase config', `${configState}${firebaseSetup.status === 'ok' ? '' : ` (${firebaseSetup.code})`}`],
  ];
  if (firebaseSetup.projectId) rows.push(['Project', firebaseSetup.projectId]);
  if (firebaseSetup.authDomain) rows.push(['Auth domain', firebaseSetup.authDomain]);
  rows.push(['Browser', state.online ? 'Online' : 'Offline']);
  rows.push(['This site', `${location.hostname} (must be an authorized domain)`]);
  rows.push(['Build', describeBuild()]);
  return `<dl class="connection-check">${rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
}

function renderLiveCheck(conn) {
  const check = state.liveCheck;
  const steps = check?.steps || [];
  const disabled = !conn.onlineFeatures || check?.running;
  return `<section class="live-check" aria-label="Live Firebase check"><div class="live-check-head"><div><b>Live Firebase check</b><small>${conn.onlineFeatures ? 'Signs in as a guest and reads one Firestore document, so it needs Anonymous sign-in and the published rules. Google sign-in, Email/Password and Authorized domains can only be confirmed by using them once.' : esc(onlineUnavailableNote(conn))}</small></div><button class="button button-outline button-small" data-action="run-live-check" ${disabled ? 'disabled' : ''}>${check?.running ? 'Checking…' : 'Run check'}</button></div>${steps.length ? `<ul class="live-check-steps">${steps.map((step) => `<li class="${step.ok ? 'is-ok' : 'is-fail'}"><i>${step.ok ? '✓' : '!'}</i><span><b>${esc(step.label)}</b><small>${esc(step.detail)}</small></span></li>`).join('')}</ul>` : ''}</section>`;
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

function renderModal() {
  if (!state.modal) return '';
  const modal = state.modal;
  if (modal.type === 'game') {
    const game = getGame(modal.gameId);
    if (!game) return '';
    const friend = modal.friend;
    const conn = connection();
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal-card game-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button><div class="modal-game-art art-${game.accent}"><img class="modal-art-image" src="${getGameArtwork(game).src}" alt="" aria-hidden="true" loading="lazy" style="object-position:${getGameArtwork(game).focal}" onerror="this.classList.add('is-failed')"><div class="art-shade"></div><div class="art-scanlines"></div><span>${esc(game.icon)}</span></div><div class="eyebrow">${esc(game.category.toUpperCase())} · 2–3 PLAYERS</div><h2 id="modal-title">${esc(game.title)}<span>.</span></h2><p>${esc(game.blurb)} Play a local practice round, or make a private room and bring your people in by link.</p><div class="modal-detail-row"><span>${icon('gamepad')} Runs in your browser</span><span>${icon('link')} Invite only</span></div><div class="game-modal-actions"><button class="button button-primary" data-action="create-room-for-game" data-game-id="${game.id}" ${conn.onlineFeatures ? '' : 'disabled'}>${icon('link')} ${friend ? `Challenge ${esc(friend.name)}` : 'Create online room'}</button><button class="button button-outline" data-action="practice-game" data-game-id="${game.id}">Practice locally ${icon('arrow')}</button></div>${conn.onlineFeatures ? `<div class="modal-small-note">Guests can join online rooms without creating an account.</div>` : `<div class="modal-alert">${esc(onlineUnavailableNote(conn))}${conn.setupNeeded ? ` <button class="text-button" data-action="show-setup">Setup guide ${icon('arrow')}</button>` : ''}</div>`}</section></div>`;
  }
  if (modal.type === 'room') {
    const game = getGame(modal.gameId) || GAMES[0];
    const conn = connection();
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal-card room-modal" role="dialog" aria-modal="true" aria-labelledby="room-modal-title"><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button><div class="eyebrow">CREATE A PRIVATE ROOM</div><h2 id="room-modal-title">Bring your crew in<span>.</span></h2><p>We’ll make a shareable link. Friends can join as guests, or sign in if they want a username.</p><form data-form="create-room" class="create-room-form"><label>CHOOSE A GAME<select name="gameId">${GAMES.map((item) => `<option value="${item.id}" ${item.id === game.id ? 'selected' : ''}>${esc(item.title)}</option>`).join('')}</select></label><label>ROOM SIZE<div class="player-count-options"><label><input type="radio" name="maxPlayers" value="2" checked><span><b>2 PLAYERS</b><small>One friend joins you</small></span></label><label><input type="radio" name="maxPlayers" value="3"><span><b>3 PLAYERS</b><small>Bring two friends</small></span></label></div></label><label>YOUR DISPLAY NAME<input type="text" name="displayName" maxlength="20" value="${esc(state.displayName || playerDisplayName())}" placeholder="Pixel pilot"></label><button type="submit" class="button button-primary button-full" ${conn.onlineFeatures ? '' : 'disabled'}>Create room & get a link ${icon('arrow')}</button></form>${modal.friend ? `<div class="direct-invite-note">${icon('people')} Direct invite for <b>${esc(modal.friend.name)}</b> will appear in their friends inbox.</div>` : ''}${conn.onlineFeatures ? `<div class="modal-small-note">No account needed for a guest room. Usernames are optional.</div>` : `<div class="modal-alert">${esc(onlineUnavailableNote(conn))}${conn.setupNeeded ? ` <button class="text-button" data-action="show-setup">Setup guide ${icon('arrow')}</button>` : ''}</div>`}</section></div>`;
  }
  if (modal.type === 'auth') {
    const conn = connection();
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal-card auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button><div class="auth-logo">${renderBrand()}</div><div class="eyebrow">A FREE ARCADE ACCOUNT</div><h2 id="auth-title">${modal.mode === 'register' ? 'Claim your player name.' : 'Welcome back.'}</h2><p>${modal.mode === 'register' ? 'Add a username to find friends and send direct challenges.' : 'Sign in to keep your username and friend list.'}</p>${conn.setupNeeded ? `<div class="modal-alert">Sign-in is off. ${esc(conn.detail)} <button class="text-button" data-action="show-setup">Setup guide ${icon('arrow')}</button></div>` : ''}${state.authError ? `<div class="form-error" role="alert">${esc(state.authError)}</div>` : ''}<button class="google-button" data-action="google-sign-in" ${firebaseReady ? '' : 'disabled'}><span class="google-glyph" aria-hidden="true">G</span><span>Continue with Google</span></button><small class="auth-provider-note">Popup sign-in is used when available; mobile or blocked popups continue in a secure redirect.</small><div class="auth-divider"><span>OR USE EMAIL</span></div><div class="auth-tabs"><button class="${modal.mode === 'login' ? 'is-active' : ''}" data-action="auth-mode" data-mode="login">Sign in</button><button class="${modal.mode === 'register' ? 'is-active' : ''}" data-action="auth-mode" data-mode="register">Create account</button></div><form data-form="auth" class="auth-form"><input type="hidden" name="mode" value="${modal.mode}">${modal.mode === 'register' ? `<label>ARCADE USERNAME<input name="username" type="text" minlength="3" maxlength="18" pattern="[A-Za-z0-9_]{3,18}" placeholder="pixelpilot" required></label>` : ''}<label>EMAIL ADDRESS<input name="email" type="email" autocomplete="email" placeholder="you@example.com" required></label><label>PASSWORD<input name="password" type="password" autocomplete="${modal.mode === 'register' ? 'new-password' : 'current-password'}" minlength="6" placeholder="At least 6 characters" required></label><button class="button button-primary button-full" type="submit" ${firebaseReady ? '' : 'disabled'}>${modal.mode === 'register' ? 'Create my account' : 'Sign in'} ${icon('arrow')}</button></form><div class="auth-divider"><span>OR</span></div><button class="button button-outline button-full" data-action="guest-play" ${firebaseReady ? '' : 'disabled'}>Continue as a guest ${icon('arrow')}</button><small class="auth-legal">A guest can join a shared room without signing up. Google and email sign-in are confirmed by Firebase before the account UI changes.</small></section></div>`;
  }
  if (modal.type === 'username') {
    const suggestion = modal.suggestion || suggestUsername(state.user?.displayName, state.user?.email);
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal-card username-modal" role="dialog" aria-modal="true" aria-labelledby="username-title"><button class="modal-close" data-action="close-modal" aria-label="Choose later">${icon('close')}</button><div class="username-badge">✦</div><div class="eyebrow">ONE LAST ARCADE SETUP</div><h2 id="username-title">Choose your player name<span>.</span></h2><p>Google confirmed your account. Pick a unique 3–18 character name before using friends and direct challenges.</p><form data-form="username-setup" class="auth-form"><label>PSD-GAMING USERNAME<input name="username" type="text" minlength="3" maxlength="18" pattern="[A-Za-z0-9_]{3,18}" value="${esc(suggestion)}" autocomplete="off" required></label><small class="username-hint">Letters, numbers, and underscores only. You can edit the suggestion.</small><button class="button button-primary button-full" type="submit">Claim this name ${icon('arrow')}</button></form><small class="auth-legal">The claim is atomic: if someone gets there first, your Google account stays safe and you can choose another name.</small></section></div>`;
  }
  if (modal.type === 'google-conflict') {
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal-card conflict-modal" role="dialog" aria-modal="true" aria-labelledby="google-conflict-title"><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button><div class="username-badge">G</div><div class="eyebrow">GOOGLE ACCOUNT ALREADY IN USE</div><h2 id="google-conflict-title">That Google account has a home<span>.</span></h2><p>It is already connected to another PSD-gaming account. Nothing was deleted or overwritten. You can sign in to that existing account, or keep your current guest account separate.</p><div class="conflict-actions"><button class="button button-primary button-full" data-action="google-sign-in-existing">Sign in to existing Google account ${icon('arrow')}</button><button class="button button-outline button-full" data-action="close-modal">Keep this account</button></div><small class="auth-legal">Signing in to the existing account will switch this browser to that account; the anonymous guest UID remains untouched in Firebase.</small></section></div>`;
  }
  if (modal.type === 'account') {
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal-card account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title"><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button><span class="account-avatar">${esc((state.profile?.username || state.user?.email || 'G').slice(0, 1).toUpperCase())}</span><div class="eyebrow">PLAYER ACCOUNT</div><h2 id="account-title">${esc(state.profile?.username || (state.user?.isAnonymous ? 'Guest player' : state.user?.email || 'Arcade player'))}</h2><p>${state.user?.isAnonymous ? 'Playing as a guest. Link Google to preserve this Firebase UID, or keep guest play link-only.' : esc(state.user?.email || 'Signed in to PSD-gaming')}</p>${state.user?.isAnonymous ? `<button class="google-button" data-action="google-sign-in">${'<span class="google-glyph" aria-hidden="true">G</span>'}<span>Link Google and keep this guest identity</span></button><button class="button button-primary button-full" data-action="open-auth">Create an email account ${icon('arrow')}</button>` : ''}${state.user && !state.user.isAnonymous && isGoogleUser(state.user) && !state.profile ? `<button class="button button-primary button-full" data-action="open-username-setup">Choose your player name ${icon('arrow')}</button>` : ''}<button class="button button-outline button-full" data-action="open-settings">${icon('settings')} Settings</button><button class="button button-outline button-full" data-action="sign-out">Sign out</button></section></div>`;
  }
  if (modal.type === 'settings') {
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal-card settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button><div class="eyebrow">PERSONALIZE THE CABINET</div><h2 id="settings-title">Settings<span>.</span></h2><p>These preferences stay on this device. Sound is off by default and uses only tiny UI tones.</p><form data-form="settings" class="settings-form"><fieldset><legend>THEME</legend><div class="theme-options"><label><input type="radio" name="theme" value="system" ${state.themePreference === 'system' ? 'checked' : ''}><span>System<small>Follow your device</small></span></label><label><input type="radio" name="theme" value="light" ${state.themePreference === 'light' ? 'checked' : ''}><span>Light<small>Bright arcade</small></span></label><label><input type="radio" name="theme" value="dark" ${state.themePreference === 'dark' ? 'checked' : ''}><span>Dark<small>Neon night</small></span></label></div></fieldset><label class="settings-label">DISPLAY NAME<input name="displayName" type="text" maxlength="20" value="${esc(state.displayName)}" placeholder="Pixel pilot"><small>Used for guest rooms and local practice. Username accounts keep their claimed username for friends.</small></label><label class="sound-toggle"><input name="soundEnabled" type="checkbox" ${state.soundEnabled ? 'checked' : ''}><span><b>Subtle sound effects</b><small>Short tap and result tones only</small></span></label><button class="button button-primary button-full" type="submit">Save settings ${icon('check')}</button></form></section></div>`;
  }
  if (modal.type === 'notifications') {
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal-card notifications-modal" role="dialog" aria-modal="true" aria-labelledby="notifications-title"><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button><div class="eyebrow">YOUR ARCADE INBOX</div><h2 id="notifications-title">Invites & requests<span>.</span></h2>${state.requests.length || state.invites.length ? `<div class="invite-list">${state.requests.map((request) => `<div class="invite-row"><span class="avatar avatar-purple">${esc((request.fromName || 'P').slice(0, 1).toUpperCase())}</span><div class="invite-row-copy"><b>@${esc(request.fromName || 'player')} wants to connect</b><small>Friend request</small></div><button class="button button-primary button-small" data-action="accept-friend" data-request-id="${request.id}">Accept</button></div>`).join('')}${state.invites.map((invite) => `<div class="invite-row"><span class="avatar avatar-cyan">${esc((invite.fromName || 'P').slice(0, 1).toUpperCase())}</span><div class="invite-row-copy"><b>${esc(invite.fromName || 'A friend')} invited you</b><small>${esc(getGame(invite.gameId)?.title || 'A game')}</small></div><button class="button button-primary button-small" data-action="join-game-invite" data-invite-id="${invite.id}" data-room-id="${esc(invite.roomId)}">Join ${icon('arrow')}</button></div>`).join('')}</div>` : `<div class="empty-inline"><span>✦</span><b>All caught up</b><small>Friend requests and game invites show up here.</small></div>`}<button class="text-button notification-friends" data-action="open-friends">Open friends page ${icon('arrow')}</button></section></div>`;
  }
  if (modal.type === 'setup') {
    const conn = connection();
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal-card setup-modal" role="dialog" aria-modal="true" aria-labelledby="setup-title"><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button><div class="eyebrow">FIREBASE ENV VARS · ONE RULES PASTE</div><h2 id="setup-title">${conn.setupNeeded ? 'Ready the online arcade' : 'Online arcade setup'}<span>.</span></h2><p>${conn.setupNeeded ? esc(conn.detail) : 'Firebase is configured for this build. Run the live check to confirm sign-in and Firestore work for this domain.'}${conn.setupNeeded && conn.hint ? ` ${esc(conn.hint)}` : ''}</p>${renderConnectionCheck(conn)}${renderLiveCheck(conn)}<ol class="setup-short-list"><li><i>01</i><span>Enable Anonymous, Email/Password, and Google in Firebase Console → Authentication → Sign-in method. Google needs a project support email.</span></li><li><i>02</i><span>Create Firestore, then paste and publish <code>firestore.rules</code>.</span></li><li><i>03</i><span>In Vercel → Settings → Environment Variables add one variable per Firebase Web config field for Production and Preview: <code>VITE_FIREBASE_API_KEY</code>, <code>VITE_FIREBASE_AUTH_DOMAIN</code>, <code>VITE_FIREBASE_PROJECT_ID</code>, <code>VITE_FIREBASE_STORAGE_BUCKET</code>, <code>VITE_FIREBASE_MESSAGING_SENDER_ID</code> and <code>VITE_FIREBASE_APP_ID</code>. Paste each bare value, without quotes.</span></li><li><i>04</i><span><b>Redeploy.</b> Vite embeds <code>VITE_*</code> values at build time, so an existing deployment never sees a changed variable.</span></li><li><i>05</i><span>Add this site’s domain (shown above) under Firebase Console → Authentication → Settings → Authorized domains.</span></li><li><i>06</i><span>Run the live check, finish Google username setup, then add <code>admins / your-uid / admin: true</code> in Firestore if you need the admin area.</span></li></ol><button class="button button-primary button-full" data-action="close-modal">Got it ${icon('check')}</button></section></div>`;
  }
  return '';
}

function requestFriendSearch(form) {
  if (!state.user || state.user.isAnonymous || !state.profile) throw new Error('Create an account with a username before adding friends.');
  const username = String(new FormData(form).get('username') || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,18}$/.test(username)) throw new Error('Enter a valid 3–18 character username.');
  state.friendSearchTerm = username;
  state.friendResults = [];
  render();
  void (async () => {
    try {
      const results = await getDocs(query(collection(db, 'profiles'), where('usernameLower', '==', username), limit(5)));
      state.friendResults = results.docs.map((item) => item.data()).filter((profile) => profile.uid !== state.user.uid && !state.friends.some((friend) => (friend.memberUids || []).includes(profile.uid)));
      render();
      if (!state.friendResults.length) showToast('No available player found with that username.', 'warning');
    } catch (error) {
      showToast(friendlyError(error), 'warning');
    }
  })();
}

async function sendFriendRequest(uid, name) {
  if (!state.user || state.user.isAnonymous || !state.profile) throw new Error('Sign in with a username to add friends.');
  await setDoc(doc(collection(db, 'friendRequests')), {
    fromUid: state.user.uid,
    toUid: uid,
    fromName: state.profile.username,
    toName: name,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  state.friendResults = [];
  showToast(`Friend request sent to @${name}.`);
}

async function respondToFriend(requestId, accepted) {
  if (!state.user || !state.profile) throw new Error('Sign in to manage friend requests.');
  const requestRef = doc(db, 'friendRequests', requestId);
  const snapshot = await getDoc(requestRef);
  if (!snapshot.exists()) throw new Error('That friend request is no longer available.');
  const request = snapshot.data();
  if (request.toUid !== state.user.uid || request.status !== 'pending') throw new Error('This request can no longer be changed.');
  if (!accepted) {
    await updateDoc(requestRef, { status: 'declined', respondedAt: serverTimestamp() });
    showToast('Friend request declined.');
    return;
  }
  const memberUids = [request.fromUid, request.toUid].sort();
  const friendRef = doc(db, 'friendships', memberUids.join('_'));
  const batch = writeBatch(db);
  batch.update(requestRef, { status: 'accepted', respondedAt: serverTimestamp() });
  batch.set(friendRef, {
    memberUids,
    memberNames: { [request.fromUid]: request.fromName, [request.toUid]: request.toName || state.profile.username },
    requestId,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  showToast(`You and @${request.fromName} are now friends.`);
}

async function joinGameInvite(inviteId, roomId) {
  const inviteRef = doc(db, 'gameInvites', inviteId);
  await updateDoc(inviteRef, { status: 'accepted', respondedAt: serverTimestamp() });
  state.modal = null;
  setHash(`room/${roomId}`);
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

function render() {
  if (!appRoot) return;
  appRoot.innerHTML = renderShell();
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
