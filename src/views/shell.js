/**
 * The app shell: sidebar, topbar, and page content area.
 * This is the outer wrapper rendered on every paint.
 */

import { state, maintenanceBlocks } from '../state.js';
import { connection } from '../connection.js';
import { esc } from '../ui/html.js';
import { renderPage } from './pages.js';
import { renderModals } from './modals.js';
import { renderToast } from './modals.js';

export function renderShell() {
  const conn = connection();
  const isLocked = maintenanceBlocks();

  if (isLocked) return renderMaintenanceNotice();

  return `
    <div class="app-shell">
      <nav class="sidebar" aria-label="Main navigation">
        <div class="sidebar-brand">
          <span class="brand-icon">🕹️</span>
          <span class="brand-name">PSD-gaming</span>
        </div>
        <div class="sidebar-nav">
          <button class="nav-item ${state.page === 'home' ? 'active' : ''}" data-action="navigate" data-page="home">🏠 Home</button>
          <button class="nav-item ${state.page === 'catalog' ? 'active' : ''}" data-action="navigate" data-page="catalog">🎮 Games</button>
          <button class="nav-item ${state.page === 'friends' ? 'active' : ''}" data-action="navigate" data-page="friends">👥 Friends</button>
          <button class="nav-item ${state.page === 'reviews' ? 'active' : ''}" data-action="navigate" data-page="reviews">⭐ Reviews</button>
          ${state.isAdmin ? `<button class="nav-item ${state.page === 'admin' ? 'active' : ''}" data-action="navigate" data-page="admin">🛡 Admin</button>` : ''}
          <button class="nav-item" data-action="navigate" data-page="privacy">📋 Privacy</button>
          <button class="nav-item" data-action="navigate" data-page="safety">⚖ Safety</button>
        </div>
        <div class="sidebar-footer">
          <div class="connection-badge ${conn.onlineFeatures ? 'online' : conn.offline ? 'offline' : 'local'}" data-action="show-setup">
            <span class="status-dot"></span>
            ${esc(conn.label)}
          </div>
          <div class="sidebar-actions">
            <button class="icon-btn" data-action="toggle-theme" title="Toggle theme">${state.resolvedTheme === 'dark' ? '☀' : '🌙'}</button>
            <button class="icon-btn" data-action="open-settings" title="Settings">⚙</button>
            ${state.user ? `<button class="icon-btn" data-action="account-menu" title="Account">👤</button>` : `<button class="btn btn-sm" data-action="open-auth">Sign in</button>`}
          </div>
        </div>
      </nav>
      <main class="main-content">
        <header class="topbar">
          <div class="topbar-left">
            <span class="topbar-brand">🕹️ PSD-gaming</span>
          </div>
          <div class="topbar-center">
            <input type="search" id="global-search" placeholder="Search games… (Ctrl+K)" autocomplete="off" value="${esc(state.query)}" />
          </div>
          <div class="topbar-right">
            <div class="connection-badge ${conn.onlineFeatures ? 'online' : conn.offline ? 'offline' : 'local'}" data-action="show-setup">
              <span class="status-dot"></span>
              ${esc(conn.label)}
            </div>
            <button class="icon-btn" data-action="toggle-theme">${state.resolvedTheme === 'dark' ? '☀' : '🌙'}</button>
          </div>
        </header>
        <div id="page-content">
          ${renderPage()}
        </div>
      </main>
    </div>
    ${renderModals()}
    ${renderToast()}
    <div id="psd-live-region" class="sr-only" aria-live="polite" aria-atomic="true"></div>
  `;
}

function renderMaintenanceNotice() {
  const m = state.maintenance;
  return `
    <div class="maintenance-notice">
      <div class="maintenance-card">
        <h1>🕹️ PSD-gaming</h1>
        <h2>The arcade is temporarily closed</h2>
        <p class="maintenance-reason">${esc(m.reason || 'We are performing maintenance. Please come back later.')}</p>
        <form data-form="maintenance-pin" class="pin-form">
          <label for="maintenance-pin-input">Access code</label>
          <input id="maintenance-pin-input" type="text" inputmode="numeric" data-maintenance-pin placeholder="0000 0000 0000 0000" maxlength="19" autocomplete="off" value="${esc(m.pinDraft)}" />
          <span id="maintenance-pin-tally" class="pin-tally">${m.pinDraft.length} of 16 digits typed</span>
          <button type="submit" class="btn btn-primary" data-maintenance-submit ${m.checking ? 'disabled' : ''}>Unlock</button>
        </form>
        ${m.unlockMessage ? `<p class="pin-feedback ${m.unlockOk ? 'success' : 'error'}">${esc(m.unlockMessage)}</p>` : ''}
        <div class="maintenance-footer">
          <button class="icon-btn" data-action="toggle-theme">${state.resolvedTheme === 'dark' ? '☀' : '🌙'}</button>
        </div>
      </div>
    </div>
  `;
}