/**
 * Every dialog the app can open: game details, create-room, sign-in, username claim, the Google
 * "already in use" conflict, the account menu, settings, the notifications inbox and the Firebase
 * setup guide.
 *
 * Like the page views these are pure "state in, HTML string out" functions. Two panels are more
 * than markup: `renderConnectionCheck` prints exactly which env vars this build saw (never their
 * values) and `renderLiveCheck` reports the result of the user-started live Firebase check.
 */

import { ROOM_GAMES as GAMES, getGame, getGameArtwork } from '../catalog.js';
import { connection, onlineUnavailableNote } from '../connection.js';
import { firebaseReady, firebaseSetup } from '../firebase.js';
import { currentGame, currentGameState, currentPlayers, currentUid, state } from '../state.js';
import { resultKind } from '../result-popup.js';
import { artImage, esc, icon, renderBrand } from '../ui/html.js';
import { activeName, isGoogleUser, playerDisplayName } from '../ui/players.js';
import { suggestUsername } from '../helpers.js';

/* global __PSD_BUILD__ */
// Injected by vite.config.js (`define`): where and when this bundle was built. Never contains config values.
/** Build stamp injected by vite.config.js (`define`); never contains config values. */
const BUILD_INFO = typeof __PSD_BUILD__ === 'undefined'
  ? { mode: 'unknown', vercelEnv: '', commit: '', builtAt: '' }
  : __PSD_BUILD__;

function describeBuild() {
  const parts = [BUILD_INFO.vercelEnv || BUILD_INFO.mode];
  if (BUILD_INFO.commit) parts.push(BUILD_INFO.commit);
  if (BUILD_INFO.builtAt) parts.push(`built ${BUILD_INFO.builtAt.replace('T', ' ').slice(0, 16)} UTC`);
  return parts.join(' · ');
}

export function renderConnectionCheck(conn) {
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

export function renderLiveCheck(conn) {
  const check = state.liveCheck;
  const steps = check?.steps || [];
  const disabled = !conn.onlineFeatures || check?.running;
  return `<section class="live-check" aria-label="Live Firebase check"><div class="live-check-head"><div><b>Live Firebase check</b><small>${conn.onlineFeatures ? 'Signs in as a guest and reads one Firestore document, so it needs Anonymous sign-in and the published rules. Google sign-in, Email/Password and Authorized domains can only be confirmed by using them once.' : esc(onlineUnavailableNote(conn))}</small></div><button class="button button-outline button-small" data-action="run-live-check" ${disabled ? 'disabled' : ''}>${check?.running ? 'Checking…' : 'Run check'}</button></div>${steps.length ? `<ul class="live-check-steps">${steps.map((step) => `<li class="${step.ok ? 'is-ok' : 'is-fail'}"><i>${step.ok ? '✓' : '!'}</i><span><b>${esc(step.label)}</b><small>${esc(step.detail)}</small></span></li>`).join('')}</ul>` : ''}</section>`;
}

const CONFETTI_COLORS = ['#ff4db8', '#2ee6ff', '#86ff5c', '#ffd23f', '#b79bff'];

/** Decorative only (aria-hidden): the same 30 pieces every time, so the markup is deterministic. */
function renderConfetti() {
  return `<div class="result-confetti" aria-hidden="true">${Array.from({ length: 30 }, (_, i) => `<i style="--x:${(i * 37 + 11) % 100}%;--dl:${((i % 7) * 0.11).toFixed(2)}s;--t:${(1.9 + (i % 5) * 0.28).toFixed(2)}s;--r:${(i * 53) % 360}deg;--c:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]}"></i>`).join('')}</div>`;
}

/**
 * The dialog that opens when a game finishes (src/result-popup.js): who won, the score, and what to do next.
 * Pure like every view; it reads the finished game from state.
 */
export function renderResultModal() {
  const game = currentGame();
  const gameState = currentGameState();
  if (!game || !gameState) return '';
  const players = currentPlayers();
  const me = currentUid();
  const kind = resultKind();
  const winner = gameState.winnerUid ? activeName(gameState.winnerUid, players) : '';
  const title = kind === 'win' ? 'You win!' : kind === 'loss' ? `${esc(winner)} wins!` : 'It’s a draw!';
  const line = kind === 'win' ? `That ${esc(game.title)} round is yours. Sweet.`
    : kind === 'loss' ? `${esc(winner)} took this one. A rematch could change that.`
      : 'Nobody blinked. Settle it with a rematch.';
  const scores = gameState.scores
    ? `<ul class="result-scores" aria-label="Final score">${players.map((player) => `<li class="${player.uid === gameState.winnerUid ? 'is-winner' : ''}"><span>${esc(player.name)}${player.uid === me ? ' <i>You</i>' : ''}</span><b>${gameState.scores[player.uid] ?? 0}</b>${player.uid === gameState.winnerUid ? '<small>Winner</small>' : ''}</li>`).join('')}</ul>`
    : '';
  const hero = kind === 'win'
    ? '<img class="result-trophy" src="/images/trophy.webp" alt="" width="480" height="480" loading="lazy" decoding="async">'
    : `<div class="result-glyph" aria-hidden="true">${kind === 'loss' ? 'GG' : 'TIE'}</div>`;
  const isHost = Boolean(state.local) || state.room?.hostUid === state.user?.uid;
  const invite = state.local
    ? `<button class="button button-outline" data-action="create-room-for-game" data-game-id="${esc(game.id)}">${icon('people')} Play a friend online</button>`
    : `<button class="button button-outline" data-action="copy-room-link">${icon('copy')} Copy room link</button>`;
  return `<div class="modal-backdrop result-backdrop" data-action="modal-backdrop"><section class="modal-card result-modal is-${kind}" role="dialog" aria-modal="true" aria-labelledby="result-title"><button class="modal-close" data-action="close-modal" aria-label="Close and view the board">${icon('close')}</button>${kind === 'win' ? renderConfetti() : ''}<div class="result-hero">${hero}</div><span class="eyebrow">${esc(game.title)} · Final</span><h2 id="result-title">${title}</h2><p>${line}</p>${scores}<div class="result-actions">${isHost ? `<button class="button button-primary" data-action="play-again" ${state.onlineActionsPending ? 'disabled title="Finishing sync…"' : ''}>${state.onlineActionsPending ? 'Syncing final move…' : 'Play again'} ${icon('arrow')}</button>` : '<p class="result-note">The host starts the next round.</p>'}<button class="button button-quiet" data-action="leave-session">${icon('grid')} Choose another game</button>${invite}<button class="text-button" data-action="close-modal">View the board</button></div></section></div>`;
}

export function renderModal() {
  if (!state.modal) return '';
  const modal = state.modal;
  if (modal.type === 'result') return renderResultModal();
  if (modal.type === 'confirm') {
    // The admin studio's "are you sure?" gate. `modal.run` is the callback that executes the
    // confirmed work; src/app.js invokes it from the confirm button. Text is plain and escaped.
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal-card confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><button class="modal-close" data-action="close-modal" aria-label="Cancel">${icon('close')}</button><div class="username-badge confirm-badge">!</div><div class="eyebrow">Confirm before it happens</div><h2 id="confirm-title">${esc(modal.title || 'Are you sure?')}</h2><p>${esc(modal.body || '')}</p><div class="conflict-actions"><button class="button button-danger button-full" data-action="confirm-modal-run">${icon('trash')} ${esc(modal.confirmLabel || 'Yes, do it')}</button><button class="button button-outline button-full" data-action="close-modal">Keep it as is</button></div></section></div>`;
  }
  if (modal.type === 'game') {
    const game = getGame(modal.gameId);
    if (!game) return '';
    const friend = modal.friend;
    const conn = connection();
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal-card game-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button><div class="modal-game-art art-${game.accent}">${artImage(getGameArtwork(game), { className: 'modal-art-image', sizes: '(min-width: 720px) 560px, 100vw' })}<span aria-hidden="true">${esc(game.icon)}</span></div><div class="eyebrow">${esc(game.category)} · 2–3 players</div><h2 id="modal-title">${esc(game.title)}<span>.</span></h2><p>${esc(game.blurb)} Play a local practice round, or make a private room and bring your people in by link.</p><div class="modal-detail-row"><span>${icon('gamepad')} Runs in your browser</span><span>${icon('link')} Invite only</span></div><div class="game-modal-actions"><button class="button button-primary" data-action="create-room-for-game" data-game-id="${game.id}" ${conn.onlineFeatures ? '' : 'disabled'}>${icon('link')} ${friend ? `Challenge ${esc(friend.name)}` : 'Create online room'}</button><button class="button button-outline" data-action="practice-game" data-game-id="${game.id}">Practice locally ${icon('arrow')}</button></div>${conn.onlineFeatures ? `<div class="modal-small-note">Guests can join online rooms without creating an account.</div>` : `<div class="modal-alert">${esc(onlineUnavailableNote(conn))}${conn.setupNeeded ? ` <button class="text-button" data-action="show-setup">Setup guide ${icon('arrow')}</button>` : ''}</div>`}</section></div>`;
  }
  if (modal.type === 'room') {
    const game = getGame(modal.gameId) || GAMES[0];
    const conn = connection();
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal-card room-modal" role="dialog" aria-modal="true" aria-labelledby="room-modal-title"><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button><div class="eyebrow">Create a private room</div><h2 id="room-modal-title">Bring your crew in<span>.</span></h2><p>We’ll make a shareable link. Friends can join as guests, or sign in if they want a username.</p><form data-form="create-room" class="create-room-form"><label>Choose a game<select name="gameId">${GAMES.map((item) => `<option value="${item.id}" ${item.id === game.id ? 'selected' : ''}>${esc(item.title)}</option>`).join('')}</select></label><label>Room size<div class="player-count-options"><label><input type="radio" name="maxPlayers" value="2" checked><span><b>2 players</b><small>One friend joins you</small></span></label><label><input type="radio" name="maxPlayers" value="3"><span><b>3 players</b><small>Bring two friends</small></span></label></div></label><label>Your display name<input type="text" name="displayName" maxlength="20" value="${esc(state.displayName || playerDisplayName())}" placeholder="Pixel pilot"></label><button type="submit" class="button button-primary button-full" ${conn.onlineFeatures ? '' : 'disabled'}>Create room & get a link ${icon('arrow')}</button></form>${modal.friend ? `<div class="direct-invite-note">${icon('people')} Direct invite for <b>${esc(modal.friend.name)}</b> will appear in their friends inbox.</div>` : ''}${conn.onlineFeatures ? `<div class="modal-small-note">No account needed for a guest room. Usernames are optional.</div>` : `<div class="modal-alert">${esc(onlineUnavailableNote(conn))}${conn.setupNeeded ? ` <button class="text-button" data-action="show-setup">Setup guide ${icon('arrow')}</button>` : ''}</div>`}</section></div>`;
  }
  if (modal.type === 'auth') {
    const conn = connection();
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal-card auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button><div class="auth-logo">${renderBrand()}</div><div class="eyebrow">A free arcade account</div><h2 id="auth-title">${modal.mode === 'register' ? 'Claim your player name.' : 'Welcome back.'}</h2><p>${modal.mode === 'register' ? 'Add a username to find friends and send direct challenges.' : 'Sign in to keep your username and friend list.'}</p>${conn.setupNeeded ? `<div class="modal-alert">Sign-in is off. ${esc(conn.detail)} <button class="text-button" data-action="show-setup">Setup guide ${icon('arrow')}</button></div>` : ''}${state.authError ? `<div class="form-error" role="alert">${esc(state.authError)}</div>` : ''}<button class="google-button" data-action="google-sign-in" ${firebaseReady ? '' : 'disabled'}><span class="google-glyph" aria-hidden="true">G</span><span>Continue with Google</span></button><small class="auth-provider-note">Popup sign-in is used when available; mobile or blocked popups continue in a secure redirect.</small><div class="auth-divider"><span>Or use email</span></div><div class="auth-tabs"><button class="${modal.mode === 'login' ? 'is-active' : ''}" data-action="auth-mode" data-mode="login">Sign in</button><button class="${modal.mode === 'register' ? 'is-active' : ''}" data-action="auth-mode" data-mode="register">Create account</button></div><form data-form="auth" class="auth-form"><input type="hidden" name="mode" value="${modal.mode}">${modal.mode === 'register' ? `<label>Arcade username<input name="username" type="text" minlength="3" maxlength="18" pattern="[A-Za-z0-9_]{3,18}" placeholder="pixelpilot" required></label>` : ''}<label>Email address<input name="email" type="email" autocomplete="email" placeholder="you@example.com" required></label><label>Password<input name="password" type="password" autocomplete="${modal.mode === 'register' ? 'new-password' : 'current-password'}" minlength="6" placeholder="At least 6 characters" required></label><button class="button button-primary button-full" type="submit" ${firebaseReady ? '' : 'disabled'}>${modal.mode === 'register' ? 'Create my account' : 'Sign in'} ${icon('arrow')}</button></form><div class="auth-divider"><span>Or</span></div><button class="button button-outline button-full" data-action="guest-play" ${firebaseReady ? '' : 'disabled'}>Continue as a guest ${icon('arrow')}</button><small class="auth-legal">A guest can join a shared room without signing up. Google and email sign-in are confirmed by Firebase before the account UI changes.</small></section></div>`;
  }
  if (modal.type === 'username') {
    const suggestion = modal.suggestion || suggestUsername(state.user?.displayName, state.user?.email);
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal-card username-modal" role="dialog" aria-modal="true" aria-labelledby="username-title"><button class="modal-close" data-action="close-modal" aria-label="Choose later">${icon('close')}</button><div class="username-badge">✦</div><div class="eyebrow">One last arcade setup</div><h2 id="username-title">Choose your player name<span>.</span></h2><p>Google confirmed your account. Pick a unique 3–18 character name before using friends and direct challenges.</p><form data-form="username-setup" class="auth-form"><label>PSD-gaming username<input name="username" type="text" minlength="3" maxlength="18" pattern="[A-Za-z0-9_]{3,18}" value="${esc(suggestion)}" autocomplete="off" required></label><small class="username-hint">Letters, numbers, and underscores only. You can edit the suggestion.</small><button class="button button-primary button-full" type="submit">Claim this name ${icon('arrow')}</button></form><small class="auth-legal">The claim is atomic: if someone gets there first, your Google account stays safe and you can choose another name.</small></section></div>`;
  }
  if (modal.type === 'google-conflict') {
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal-card conflict-modal" role="dialog" aria-modal="true" aria-labelledby="google-conflict-title"><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button><div class="username-badge">G</div><div class="eyebrow">Google account already in use</div><h2 id="google-conflict-title">That Google account has a home<span>.</span></h2><p>It is already connected to another PSD-gaming account. Nothing was deleted or overwritten. You can sign in to that existing account, or keep your current guest account separate.</p><div class="conflict-actions"><button class="button button-primary button-full" data-action="google-sign-in-existing">Sign in to existing Google account ${icon('arrow')}</button><button class="button button-outline button-full" data-action="close-modal">Keep this account</button></div><small class="auth-legal">Signing in to the existing account will switch this browser to that account; the anonymous guest UID remains untouched in Firebase.</small></section></div>`;
  }
  if (modal.type === 'account') {
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal-card account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title"><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button><span class="account-avatar">${esc((state.profile?.username || state.user?.email || 'G').slice(0, 1).toUpperCase())}</span><div class="eyebrow">Player account</div><h2 id="account-title">${esc(state.profile?.username || (state.user?.isAnonymous ? 'Guest player' : state.user?.email || 'Arcade player'))}</h2><p>${state.user?.isAnonymous ? 'Playing as a guest. Link Google to preserve this Firebase UID, or keep guest play link-only.' : esc(state.user?.email || 'Signed in to PSD-gaming')}</p>${state.user?.isAnonymous ? `<button class="google-button" data-action="google-sign-in">${'<span class="google-glyph" aria-hidden="true">G</span>'}<span>Link Google and keep this guest identity</span></button><button class="button button-primary button-full" data-action="open-auth">Create an email account ${icon('arrow')}</button>` : ''}${state.user && !state.user.isAnonymous && isGoogleUser(state.user) && !state.profile ? `<button class="button button-primary button-full" data-action="open-username-setup">Choose your player name ${icon('arrow')}</button>` : ''}<button class="button button-outline button-full" data-action="open-settings">${icon('settings')} Settings</button><button class="button button-outline button-full" data-action="sign-out">Sign out</button></section></div>`;
  }
  if (modal.type === 'settings') {
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal-card settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button><div class="eyebrow">Personalize the cabinet</div><h2 id="settings-title">Settings<span>.</span></h2><p>These preferences stay on this device. Sound is off by default and uses only tiny UI tones.</p><form data-form="settings" class="settings-form"><fieldset><legend>Theme</legend><div class="theme-options"><label><input type="radio" name="theme" value="system" ${state.themePreference === 'system' ? 'checked' : ''}><span>System<small>Follow your device</small></span></label><label><input type="radio" name="theme" value="light" ${state.themePreference === 'light' ? 'checked' : ''}><span>Light<small>Bright arcade</small></span></label><label><input type="radio" name="theme" value="dark" ${state.themePreference === 'dark' ? 'checked' : ''}><span>Dark<small>Neon night</small></span></label></div></fieldset><label class="settings-label">Display name<input name="displayName" type="text" maxlength="20" value="${esc(state.displayName)}" placeholder="Pixel pilot"><small>Used for guest rooms and local practice. Username accounts keep their claimed username for friends.</small></label><label class="sound-toggle"><input name="soundEnabled" type="checkbox" ${state.soundEnabled ? 'checked' : ''}><span><b>Subtle sound effects</b><small>Short tap and result tones only</small></span></label><button class="button button-primary button-full" type="submit">Save settings ${icon('check')}</button></form></section></div>`;
  }
  if (modal.type === 'notifications') {
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal-card notifications-modal" role="dialog" aria-modal="true" aria-labelledby="notifications-title"><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button><div class="eyebrow">Your arcade inbox</div><h2 id="notifications-title">Invites & requests<span>.</span></h2>${state.requests.length || state.invites.length ? `<div class="invite-list">${state.requests.map((request) => `<div class="invite-row"><span class="avatar avatar-purple">${esc((request.fromName || 'P').slice(0, 1).toUpperCase())}</span><div class="invite-row-copy"><b>@${esc(request.fromName || 'player')} wants to connect</b><small>Friend request</small></div><button class="button button-primary button-small" data-action="accept-friend" data-request-id="${request.id}">Accept</button></div>`).join('')}${state.invites.map((invite) => `<div class="invite-row"><span class="avatar avatar-cyan">${esc((invite.fromName || 'P').slice(0, 1).toUpperCase())}</span><div class="invite-row-copy"><b>${esc(invite.fromName || 'A friend')} invited you</b><small>${esc(getGame(invite.gameId)?.title || 'A game')}</small></div><button class="button button-primary button-small" data-action="join-game-invite" data-invite-id="${invite.id}" data-room-id="${esc(invite.roomId)}">Join ${icon('arrow')}</button></div>`).join('')}</div>` : `<div class="empty-inline"><span>✦</span><b>All caught up</b><small>Friend requests and game invites show up here.</small></div>`}<button class="text-button notification-friends" data-action="open-friends">Open friends page ${icon('arrow')}</button></section></div>`;
  }
  if (modal.type === 'setup') {
    const conn = connection();
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal-card setup-modal" role="dialog" aria-modal="true" aria-labelledby="setup-title"><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button><div class="eyebrow">Firebase env vars · one rules paste</div><h2 id="setup-title">${conn.setupNeeded ? 'Ready the online arcade' : 'Online arcade setup'}<span>.</span></h2><p>${conn.setupNeeded ? esc(conn.detail) : 'Firebase is configured for this build. Run the live check to confirm sign-in and Firestore work for this domain.'}${conn.setupNeeded && conn.hint ? ` ${esc(conn.hint)}` : ''}</p>${renderConnectionCheck(conn)}${renderLiveCheck(conn)}<ol class="setup-short-list"><li><i>01</i><span>Enable Anonymous, Email/Password, and Google in Firebase Console → Authentication → Sign-in method. Google needs a project support email.</span></li><li><i>02</i><span>Create Firestore, then paste and publish <code>firestore.rules</code>.</span></li><li><i>03</i><span>In Vercel → Settings → Environment Variables add one variable per Firebase Web config field for Production and Preview: <code>VITE_FIREBASE_API_KEY</code>, <code>VITE_FIREBASE_AUTH_DOMAIN</code>, <code>VITE_FIREBASE_PROJECT_ID</code>, <code>VITE_FIREBASE_STORAGE_BUCKET</code>, <code>VITE_FIREBASE_MESSAGING_SENDER_ID</code> and <code>VITE_FIREBASE_APP_ID</code>. Paste each bare value, without quotes.</span></li><li><i>04</i><span><b>Redeploy.</b> Vite embeds <code>VITE_*</code> values at build time, so an existing deployment never sees a changed variable.</span></li><li><i>05</i><span>Add this site’s domain (shown above) under Firebase Console → Authentication → Settings → Authorized domains.</span></li><li><i>06</i><span>Run the live check, finish Google username setup, then add <code>admins / your-uid / admin: true</code> in Firestore if you need the admin area.</span></li></ol><button class="button button-primary button-full" data-action="close-modal">Got it ${icon('check')}</button></section></div>`;
  }
  return '';
}
