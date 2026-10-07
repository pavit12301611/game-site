/**
 * The app chrome: sidebar, topbar, mobile nav, and the shell that wraps them around the current
 * page (plus the modal and the toast when there is one). `renderPage` is the router's switch - it
 * maps `state.page` to one of the page views.
 *
 * Pure rendering only: navigation happens through `data-action="navigate"` buttons and the hash
 * router in `src/app.js`.
 */

import { connection } from '../connection.js';
import { state } from '../state.js';
import { esc, icon, renderBrand } from '../ui/html.js';
import { renderModal } from './modals.js';
import { renderAdmin, renderCatalog, renderFriends, renderGameScreen, renderHome, renderReviews, renderRoom } from './pages.js';
import { renderPrivacy, renderSafety } from './legal.js';

export function renderSidebar() {
  const conn = connection();
  const items = [
    { page: 'home', icon: 'home', label: 'Home' },
    { page: 'catalog', icon: 'grid', label: 'Game library', count: '40' },
    { page: 'friends', icon: 'people', label: 'Friends', count: state.requests.length || null },
    { page: 'reviews', icon: 'star', label: 'Reviews' },
  ];
  if (state.isAdmin) items.push({ page: 'admin', icon: 'shield', label: 'Admin studio' });
  return `<aside class="sidebar" aria-label="Arcade menu">
    <a class="brand-lockup" href="#/home" data-action="navigate" data-page="home" aria-label="PSD-gaming home">${renderBrand()}<span><b>PSD</b><small>GAMING</small></span></a>
    <div class="side-caption">Your arcade</div>
    <nav class="side-nav" aria-label="Main navigation">${items.map((item) => `<button class="nav-item ${state.page === item.page ? 'is-active' : ''}" data-action="navigate" data-page="${item.page}">${icon(item.icon)}<span>${item.label}</span>${item.count ? `<b class="nav-count">${item.count}</b>` : ''}</button>`).join('')}</nav>
    <div class="sidebar-divider"></div>
    <div class="side-caption">Quick play</div>
    <button class="nav-item" data-action="quick-play">${icon('spark')}<span>Surprise me</span></button>
    <div class="sidebar-promo">
      <div class="promo-glyph">${icon('gamepad')}</div><span class="eyebrow">Friends, not distance</span>
      <p>One link is all it takes to meet at the arcade.</p>
      <button class="text-button" data-action="open-friends">Find your crew ${icon('arrow')}</button>
    </div>
    <nav class="sidebar-legal" aria-label="Privacy and safety">
      <button class="text-button" data-action="navigate" data-page="privacy">Privacy</button><i>·</i><button class="text-button" data-action="navigate" data-page="safety">Terms &amp; safety</button>
    </nav>
    <div class="sidebar-bottom" title="${esc(conn.title)}">
      <div class="connection-dot is-${conn.kind}"></div><span>${esc(conn.label)}</span>
    </div>
  </aside>`;
}

export function renderTopbar() {
  const name = state.profile?.username || (state.user?.isAnonymous ? 'Guest player' : 'Welcome, player');
  const unread = state.requests.length + state.invites.length;
  const themeLabel = state.resolvedTheme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
  return `<header class="topbar">
    <div class="topbar-mobile-brand">${renderBrand()}<b>PSD<span>-GAMING</span></b></div>
    <label class="search-box">${icon('search')}<input id="global-search" type="search" placeholder="Search 40 arcade games..." value="${esc(state.query)}" aria-label="Search the game library" /><kbd>⌘ K</kbd></label>
    <div class="topbar-actions">
      <button class="icon-button theme-toggle" data-action="toggle-theme" aria-label="${themeLabel}" title="${themeLabel}">${icon(state.resolvedTheme === 'light' ? 'moon' : 'sun')}</button>
      <button class="icon-button notification-button" data-action="notifications" aria-label="Notifications">${icon('bell')}${unread ? `<i>${unread > 9 ? '9+' : unread}</i>` : ''}</button>
      ${state.user ? `<button class="profile-button" data-action="account-menu"><span class="avatar ${state.user.isAnonymous ? 'avatar-guest' : ''}">${esc((state.profile?.username || state.user.email || 'G').slice(0, 1).toUpperCase())}</span><span class="profile-copy"><b>${esc(name)}</b><small>${state.user.isAnonymous ? 'Playing as a guest' : 'Arcade member'}</small></span><span class="profile-chevron">⌄</span></button>` : `<button class="button button-quiet top-signin" data-action="open-auth">Sign in</button>`}
    </div>
  </header>`;
}

export function renderMobileNav() {
  const items = [
    ['home', 'Home', 'home'], ['catalog', 'Games', 'grid'], ['friends', 'Friends', 'people'], ['reviews', 'Reviews', 'star'],
  ];
  if (state.isAdmin) items.push(['admin', 'Admin', 'shield']);
  const pageItems = items.map(([page, label, iconName]) => `<button class="mobile-nav-item ${state.page === page ? 'is-active' : ''}" data-action="navigate" data-page="${page}">${icon(iconName)}<span>${label}</span></button>`).join('');
  return `<nav class="mobile-nav has-settings ${state.isAdmin ? 'has-admin' : ''}" aria-label="Mobile navigation">${pageItems}<button class="mobile-nav-item" data-action="open-settings">${icon('settings')}<span>Settings</span></button></nav>`;
}

/**
 * The strip an admin sees while maintenance mode is on. Visitors never see this - they get the
 * maintenance page itself - so it exists to make the state impossible to forget and to keep the
 * switch one click away.
 */
function renderMaintenanceBanner() {
  if (!state.isAdmin || !state.maintenance?.enabled) return '';
  const pin = state.maintenance.pinActive
    ? `Tester PIN generation ${state.maintenance.pinVersion} is live.`
    : 'No tester PIN is live.';
  return `<div class="maintenance-banner" role="status">${icon('shield')}<span>Maintenance mode is ON. Visitors see the maintenance page. ${esc(pin)}</span><button class="text-button" data-action="navigate" data-page="admin" data-tab="maintenance">Open the switch ${icon('arrow')}</button></div>`;
}

export function renderShell() {
  const conn = connection();
  const pageNames = { home: 'Welcome back', catalog: 'Game library', friends: 'Your crew', reviews: 'Player reviews', admin: 'Admin studio', room: 'Private room', game: 'Now playing', privacy: 'Privacy notice', safety: 'Terms & safety' };
  // The banner sits at the top of the main column, not in `.app-shell` itself: from 1024 px up the
  // shell is a two-column grid, and a new first child would push the sidebar out of its column.
  return `<div class="app-shell"><button class="button button-primary skip-link" data-action="skip-to-content">Skip to content</button>${renderSidebar()}<div class="main-column">${renderMaintenanceBanner()}${renderTopbar()}<aside class="page-context" aria-label="Page status"><span class="page-context-name">${pageNames[state.page] || 'Arcade'}</span><span class="network-status is-${conn.kind}" title="${esc(conn.title)}"><i></i><span>${esc(conn.shortLabel)}</span></span></aside><main class="page-content" id="page-content">${renderPage()}</main></div>${renderMobileNav()}</div>${state.modal ? renderModal() : ''}${state.toast ? `<div class="toast toast-${state.toast.kind}" role="status">${icon(state.toast.kind === 'success' ? 'check' : 'spark')}<span>${esc(state.toast.message)}</span></div>` : ''}`;
}

export function renderPage() {
  switch (state.page) {
    case 'catalog': return renderCatalog();
    case 'friends': return renderFriends();
    case 'reviews': return renderReviews();
    case 'admin': return renderAdmin();
    case 'room': return renderRoom();
    case 'game': return renderGameScreen();
    case 'privacy': return renderPrivacy();
    case 'safety': return renderSafety();
    default: return renderHome();
  }
}
