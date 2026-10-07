/**
 * Modal dialogs: auth, settings, game info, account, setup, report, result, confirm, etc.
 */

import { state, currentPresence, maintenanceBlocks } from '../state.js';
import { connection } from '../connection.js';
import { GAMES, getGame, getGameArtwork, getGameGuide } from '../catalog.js';
import { esc, icon } from '../ui/html.js';
import { playerDisplayName } from '../ui/players.js';

/**
 * Renders the presence label for a player.
 * @param {{ status: string, lastSeenMs: number } | undefined} verdict
 * @returns {string}
 */
export function presenceLabel(verdict) {
  if (!verdict || verdict.status === 'here') return 'IN THE ROOM';
  if (verdict.status === 'away') return 'AWAY';
  return 'LEFT THE ROOM';
}

export function renderModals() {
  if (!state.modal) return '';
  const m = state.modal;

  switch (m.type) {
    case 'auth': return renderAuthModal(m);
    case 'settings': return renderSettingsModal();
    case 'game': return renderGameModal(m);
    case 'account': return renderAccountModal();
    case 'setup': return renderSetupModal();
    case 'report': return renderReportModal(m);
    case 'result': return renderResultModal(m);
    case 'confirm': return renderConfirmModal(m);
    case 'room': return renderRoomModal(m);
    case 'username': return renderUsernameModal(m);
    case 'notifications': return renderNotificationsModal();
    default: return '';
  }
}

export function renderToast() {
  if (!state.toast) return '';
  return `<div class="toast toast-${state.toast.type}" role="alert">${esc(state.toast.message)}</div>`;
}

function wrapModal(content) {
  return `<div class="modal-backdrop" data-action="modal-backdrop" role="dialog" aria-modal="true"><div class="modal-content">${content}<button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button></div></div>`;
}

function renderAuthModal(m) {
  const isRegister = m.mode === 'register';
  return wrapModal(`
    <h2>${isRegister ? 'Create Account' : 'Sign In'}</h2>
    ${state.authError ? `<p class="error-text">${esc(state.authError)}</p>` : ''}
    <form data-form="auth">
      <input type="hidden" name="mode" value="${isRegister ? 'register' : 'login'}" />
      <label>Email<input type="email" name="email" required autocomplete="email" /></label>
      <label>Password<input type="password" name="password" required autocomplete="${isRegister ? 'new-password' : 'current-password'}" /></label>
      ${isRegister ? '<label>Username<input type="text" name="username" required minlength="3" maxlength="18" pattern="[a-zA-Z0-9_-]+" /></label>' : ''}
      <button type="submit" class="btn btn-primary">${isRegister ? 'Create Account' : 'Sign In'}</button>
    </form>
    <div class="auth-alt">
      <button class="btn btn-secondary" data-action="google-sign-in">Continue with Google</button>
      <button class="btn btn-ghost" data-action="guest-play">Guest Play</button>
    </div>
    <p class="auth-switch">
      ${isRegister ? 'Already have an account?' : "Don't have an account?"}
      <button class="btn-link" data-action="auth-mode" data-mode="${isRegister ? 'login' : 'register'}">${isRegister ? 'Sign in' : 'Create one'}</button>
    </p>
  `);
}

function renderSettingsModal() {
  return wrapModal(`
    <h2>Settings</h2>
    <form data-form="settings">
      <label>Display Name<input type="text" name="displayName" maxlength="20" value="${esc(state.displayName)}" /></label>
      <label>Theme<select name="theme">
        <option value="system" ${state.themePreference === 'system' ? 'selected' : ''}>System</option>
        <option value="dark" ${state.themePreference === 'dark' ? 'selected' : ''}>Dark</option>
        <option value="light" ${state.themePreference === 'light' ? 'selected' : ''}>Light</option>
      </select></label>
      <label><input type="checkbox" name="soundEnabled" ${state.soundEnabled ? 'checked' : ''} /> Sound effects</label>
      <button type="submit" class="btn btn-primary">Save</button>
    </form>
  `);
}

function renderGameModal(m) {
  const game = getGame(m.gameId);
  if (!game) return wrapModal('<h2>Game not found</h2>');
  const art = getGameArtwork(game);
  const guide = getGameGuide(game);
  const conn = connection();

  return wrapModal(`
    <div class="game-modal">
      <div class="game-modal-banner"><img src="${art.src}" srcset="${art.srcset}" width="${art.width}" height="${art.height}" alt="${esc(art.alt)}" loading="lazy" /><span class="engine-badge">${esc(art.engineLabel)}</span></div>
      <h2>${esc(game.title)}</h2>
      <p>${esc(game.blurb)}</p>
      <div class="card-meta">
        <span class="meta-chip">${esc(game.duration)}</span>
        <span class="meta-chip">${esc(game.difficulty)}</span>
        <span class="meta-chip">${esc(game.input)}</span>
      </div>
      ${guide ? `<div class="guide-content"><p><b>${esc(guide.mode)}</b></p><p><b>Goal:</b> ${esc(guide.goal)}</p><p><b>Controls:</b> ${esc(guide.controls)}</p><p>${esc(guide.rules)}</p></div>` : ''}
      <div class="game-modal-actions">
        <button class="btn btn-primary" data-action="practice-game" data-game-id="${game.id}">Practice</button>
        ${conn.onlineFeatures ? `<button class="btn btn-secondary" data-action="create-room-for-game" data-game-id="${game.id}">Create Room</button>` : ''}
      </div>
    </div>
  `);
}

function renderAccountModal() {
  if (!state.user) return wrapModal('<h2>Not signed in</h2><button class="btn btn-primary" data-action="open-auth">Sign in</button>');
  return wrapModal(`
    <h2>Account</h2>
    ${state.profile ? `<p>@${esc(state.profile.username)}</p>` : '<p>Guest account</p>'}
    ${!state.profile ? `<button class="btn btn-secondary" data-action="open-username-setup">Choose a Username</button>` : ''}
    <button class="btn btn-secondary" data-action="open-settings">Settings</button>
    <button class="btn btn-ghost" data-action="open-delete-account">Delete Account</button>
    <button class="btn btn-ghost" data-action="sign-out">Sign Out</button>
  `);
}

function renderSetupModal() {
  const conn = connection();
  const build = /** @type {any} */ (globalThis).__PSD_BUILD__ || {};
  return wrapModal(`
    <h2>Setup Guide</h2>
    <p><b>Connection:</b> ${esc(conn.label)}</p>
    ${conn.detail ? `<p>${esc(conn.detail)}</p>` : ''}
    <p><b>Build:</b> ${esc(build.mode || 'unknown')} · ${esc(build.vercelEnv || 'local')} · ${esc(build.commit || 'dev')}</p>
    <p><b>This site:</b> ${esc(location.host)}</p>
    <button class="btn btn-primary" data-action="run-live-check" ${state.liveCheck?.running ? 'disabled' : ''}>
      ${state.liveCheck?.running ? 'Checking…' : 'Run Check'}
    </button>
    ${state.liveCheck?.result ? `<p class="${state.liveCheck.result.ok ? 'success-text' : 'error-text'}">${esc(state.liveCheck.result.message)}</p>` : ''}
  `);
}

function renderReportModal(m) {
  return wrapModal(`
    <h2>Report a Problem</h2>
    <form data-form="report">
      <label>Type<select name="kind">
        <option value="other" ${m.kind === 'other' ? 'selected' : ''}>Other</option>
        <option value="bug">Bug</option>
        <option value="abuse">Abuse</option>
        <option value="cheat">Cheating</option>
      </select></label>
      <label>Message<textarea name="message" rows="4" required maxlength="1000" placeholder="Describe what happened…"></textarea></label>
      <input type="hidden" name="targetUid" value="${esc(m.targetUid || '')}" />
      <input type="hidden" name="roomId" value="${esc(m.roomId || '')}" />
      <button type="submit" class="btn btn-primary">Send Report</button>
    </form>
  `);
}

function renderResultModal(m) {
  return wrapModal(`
    <div class="result-modal">
      <h2>${esc(m.title)}</h2>
      ${m.isDraw ? '<p>Great game, everyone!</p>' : m.isWinner ? '<p>Congratulations! 🏆</p>' : '<p>Better luck next time!</p>'}
      <div class="result-actions">
        <button class="btn btn-primary" data-action="play-again">Play Again</button>
        <button class="btn btn-ghost" data-action="leave-session">Leave</button>
      </div>
    </div>
  `);
}

function renderConfirmModal(m) {
  return wrapModal(`
    <h2>${esc(m.title)}</h2>
    <p>${esc(m.body)}</p>
    <div class="confirm-actions">
      <button class="btn btn-primary" data-action="confirm-modal-run">${esc(m.confirmLabel || 'Confirm')}</button>
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
    </div>
  `);
}

function renderRoomModal(m) {
  const conn = connection();
  return wrapModal(`
    <h2>Create Online Room</h2>
    ${!conn.onlineFeatures ? `<p class="error-text">${esc(conn.detail || 'Online rooms are unavailable.')}</p>` : ''}
    <form data-form="create-room">
      <label>Game<select name="gameId">
        ${GAMES.map(g => `<option value="${g.id}" ${g.id === m.gameId ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}
      </select></label>
      <label>Players<select name="maxPlayers">
        <option value="2">2 players</option>
        <option value="3">3 players</option>
      </select></label>
      ${m.friend ? `<p>Inviting: @${esc(m.friend.name)}</p><input type="hidden" name="friendUid" value="${esc(m.friend.uid)}" />` : ''}
      <label>Display Name<input type="text" name="displayName" maxlength="20" value="${esc(state.displayName)}" /></label>
      <button type="submit" class="btn btn-primary" ${conn.onlineFeatures ? '' : 'disabled'}>Create Room</button>
    </form>
  `);
}

function renderUsernameModal(m) {
  return wrapModal(`
    <h2>Choose a Username</h2>
    <form data-form="username-setup">
      <label>Username<input type="text" name="username" required minlength="3" maxlength="18" pattern="[a-zA-Z0-9_-]+" value="${esc(m.suggestion || '')}" /></label>
      <p class="hint">3–18 characters. Letters, numbers, hyphens, underscores.</p>
      <button type="submit" class="btn btn-primary">Claim Username</button>
    </form>
  `);
}

function renderNotificationsModal() {
  return wrapModal(`
    <h2>Notifications</h2>
    ${state.requests.length ? state.requests.map(r => `
      <div class="notification-item">
        <span>@${esc(r.fromName || r.fromUid)} wants to be friends</span>
        <button class="btn btn-sm" data-action="accept-friend" data-request-id="${esc(r.id)}">Accept</button>
      </div>
    `).join('') : '<p>No new notifications.</p>'}
    ${state.invites.length ? state.invites.map(inv => `
      <div class="notification-item">
        <span>@${esc(inv.fromName || inv.fromUid)} invited you to play</span>
        <button class="btn btn-sm btn-primary" data-action="join-game-invite" data-invite-id="${esc(inv.id)}" data-room-id="${esc(inv.roomId)}">Join</button>
      </div>
    `).join('') : ''}
  `);
}