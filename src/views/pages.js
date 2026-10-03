/**
 * Page views: the five screens the router can show (home, catalog, friends, admin, room/game) plus
 * the smaller renderers they share - game cards and grid, the personal shelves, date labels, the
 * lobby, the "how to play" panel and the live match screen.
 *
 * Every function here is "state in, HTML string out": they read `state` and the derived getters but
 * never write to it, never talk to Firebase, and never install event handlers. Buttons carry a
 * `data-action` attribute and the click router in `src/app.js` decides what they do, which is what
 * keeps these views testable without a browser.
 *
 * Every value that comes from another player (names, room ids, game titles) goes through `esc()`.
 */

import { CATEGORIES, CATEGORY_ARTWORK, ROOM_GAMES as GAMES, LIBRARY, HERO_ARTWORK, getGame, getGameArtwork, getGameGuide } from '../catalog.js';
import { connection } from '../connection.js';
import { firebaseReady, firebaseSetup } from '../firebase.js';
import { isRoomExpired } from '../helpers.js';
import { state, currentGame, currentGameState, currentPlayers, currentPresence, currentUid, presenceNow } from '../state.js';
import { artImage, esc, icon } from '../ui/html.js';
import { formatAwayFor } from '../presence-status.js';
import { activeName, isGoogleUser } from '../ui/players.js';
import { renderEngineBoard } from './boards.js';

/** The 640 px picture of a game, used as the backdrop of the game stage heading. */
function stageArt(game) {
  const art = getGameArtwork(game);
  return (art.srcset || '').split(' ')[0] || art.src;
}

export function renderGameCard(game, level = 3) {
  const artwork = getGameArtwork(game);
  const isFavorite = state.favorites.includes(game.id);
  return `<article class="game-card ${game.options.dimension === '3D' ? 'is-3d' : ''}" data-category="${esc(game.category)}">
    <span class="game-art art-${game.accent || 'blue'}">${artImage(artwork, { className: 'game-art-image', sizes: '(min-width: 1024px) 320px, (min-width: 640px) 45vw, calc(100vw - 32px)' })}</span>
    <div class="game-card-copy"><span class="game-card-meta">${game.options.dimension === '3D' ? '◈ 3D' : '2D'} · ${esc(game.category)} · ${game.options.launch ? esc(game.options.players || 'Solo') : '2–3 players'} · ${esc(artwork.engineLabel)}</span><h${level} class="game-card-title">${game.options.launch ? `<a class="game-card-hit" href="${esc(game.options.launch)}" data-action="launch-solo" data-game-id="${game.id}" data-solo-game="${game.id}" aria-label="Play ${esc(game.title)}">${esc(game.title)}</a>` : `<button class="game-card-hit" data-action="open-game" data-game-id="${game.id}" aria-label="Open ${esc(game.title)}">${esc(game.title)}</button>`}</h${level}><p>${esc(game.blurb)}</p><span class="card-play" aria-hidden="true">Open ${icon('arrow')}</span></div>
    <button class="favorite-button ${isFavorite ? 'is-favorite' : ''}" data-action="toggle-favorite" data-game-id="${game.id}" aria-label="${isFavorite ? 'Remove' : 'Add'} ${esc(game.title)} ${isFavorite ? 'from' : 'to'} favorites" aria-pressed="${isFavorite}">${isFavorite ? '★' : '☆'}</button>
  </article>`;
}

export function renderGameGrid(games, level = 3) {
  if (!games.length) return `<div class="empty-state"><div class="empty-icon">⌕</div><h3>No games found</h3><p>Try another name or switch the category filter.</p><button class="button button-outline" data-action="clear-filters">Clear filters</button></div>`;
  return `<div class="game-grid">${games.map((game) => renderGameCard(game, level)).join('')}</div>`;
}

export function gamesForIds(ids) {
  return ids.map((id) => LIBRARY.find(game => game.id === id)).filter(Boolean);
}

export function renderPersonalShelves() {
  const favoriteGames = gamesForIds(state.favorites).slice(0, 4);
  const recentGames = gamesForIds(state.recentGames).slice(0, 4);
  if (!favoriteGames.length && !recentGames.length) return '';
  return `<section class="personal-shelves"><div class="personal-shelf-head"><div><div class="eyebrow">Your shortlist</div><h2>Keep the good ones close<span>.</span></h2><p>Favorites and recent games stay on this device, no extra account data required.</p></div><button class="text-button" data-action="navigate" data-page="catalog">Open the full shelf ${icon('arrow')}</button></div>${favoriteGames.length ? `<div class="personal-shelf"><div class="shelf-label"><span>★ FAVORITES</span><b>${favoriteGames.length}</b></div>${renderGameGrid(favoriteGames)}</div>` : ''}${recentGames.length ? `<div class="personal-shelf"><div class="shelf-label"><span>↺ RECENTLY PLAYED</span><b>${recentGames.length}</b></div>${renderGameGrid(recentGames)}</div>` : ''}</section>`;
}

export function filteredGames() {
  const term = state.query.trim().toLowerCase();
  return LIBRARY.filter((game) => (state.category === 'All games' || game.category === state.category || (state.category === '3D arenas' && game.options.dimension === '3D') || (state.category === '2D classics' && game.options.dimension !== '3D'))
    && (!term || `${game.title} ${game.category} ${game.blurb}`.toLowerCase().includes(term)));
}

export function renderSetupCallout(conn = connection()) {
  if (!conn.setupNeeded) return '';
  return `<aside class="setup-callout is-alert" aria-label="Firebase setup needed">${icon('spark')}<span><b>${esc(conn.detail)}</b>${conn.hint ? ` <small>${esc(conn.hint)}</small>` : ''}<small>Online rooms, accounts and friends are off until this is fixed. Local practice works.</small></span><button data-action="show-setup">Setup guide ${icon('arrow')}</button></aside>`;
}

export function renderCategoryRow() {
  const cards = Object.keys(CATEGORY_ARTWORK).map((name) => {
    const count = LIBRARY.filter((game) => game.category === name).length;
    return `<li><button class="category-card" data-action="filter-category" data-category="${esc(name)}">${artImage(CATEGORY_ARTWORK[name], { className: 'category-card-image', sizes: '(min-width: 1024px) 280px, (min-width: 560px) 45vw, 100vw' })}<span class="category-card-copy"><b>${esc(name)}</b><small>${count} games</small></span></button></li>`;
  }).join('');
  return `<section class="section-block category-section" aria-labelledby="category-title"><div class="section-heading"><div><div class="eyebrow">Find your mood</div><h2 id="category-title">Browse by category<span>.</span></h2></div></div><ul class="category-row">${cards}</ul></section>`;
}

export function renderHome() {
  const featured = LIBRARY.slice(0, 4);
  const conn = connection();
  return `<section class="hero-panel">
    ${artImage(HERO_ARTWORK, { className: 'hero-artwork', hero: true })}
    <div class="hero-copy"><div class="hero-kicker"><span class="live-pulse is-${conn.kind}"></span>${esc(conn.label)}<i>·</i> No downloads</div><p class="press-start" aria-hidden="true">▶ PRESS START</p><h1>Your next<br><em>obsession.</em></h1><p>Twelve standalone games. Ten social classics. From a neon snake to a real 3D racing circuit—different rules, different worlds, no numbered copies.</p><div class="hero-actions"><button class="button button-primary" data-action="navigate" data-page="catalog">Explore the arcade ${icon('arrow')}</button><button class="button button-glass" data-action="open-friends">Play with friends ${icon('people')}</button></div><div class="hero-footnote"><b>Solo adventures & social classics</b> · works on laptops &amp; phones</div></div>
  </section>
  <div class="marquee" aria-hidden="true"><span>★ INSERT FRIENDS ★ PRESS START ★ ${LIBRARY.length} DISTINCT GAMES ★ 2–3 PLAYERS ★ NO DOWNLOADS ★ SHARE A LINK ★ HIGH SCORE IS WAITING ★</span></div>
  ${renderSetupCallout(conn)}
  <section class="stat-strip" aria-label="Arcade facts"><div><b>${LIBRARY.length}</b><span>distinct games</span></div><div><b>2–3</b><span>players per room</span></div><div><b>0</b><span>downloads required</span></div></section>
  <section class="section-block featured-section"><div class="section-heading"><div><div class="eyebrow">Pick up and play</div><h2>Built to be played<span>.</span></h2><p>Four different ways to get completely carried away.</p></div><button class="text-button" data-action="navigate" data-page="catalog">Browse all ${LIBRARY.length} ${icon('arrow')}</button></div>${renderGameGrid(featured)}</section>
  <section class="section-block"><div class="section-heading"><div><div class="eyebrow">BETTER WITH YOUR PEOPLE</div><h2>One room. Real rivalries<span>.</span></h2><p>Ten distinct social classics. Practice against the CPU or invite 2–3 players when online rooms are configured.</p></div></div>${renderGameGrid(GAMES.slice(0, 4))}</section>
  <section class="section-block featured-section"><div class="section-heading"><div><div class="eyebrow">NEW · THE TABLETOP COLLECTION</div><h2>A different kind of challenge<span>.</span></h2><p>Merge. Uncover. Outflank. Find your angle. Four distinct games, not four versions of the same one.</p></div></div>${renderGameGrid(LIBRARY.slice(4, 8))}</section>
  <section class="section-block featured-section"><div class="section-heading"><div><div class="eyebrow">NEW · THE CHALLENGE COLLECTION</div><h2>Think fast. Land softly<span>.</span></h2><p>Stacking, crate puzzles, lunar flight and hex territory. Four new mechanics, four different challenges.</p></div></div>${renderGameGrid(LIBRARY.slice(8, 12))}</section>
  ${renderCategoryRow()}
  ${renderPersonalShelves()}
  <section class="invite-banner"><div class="invite-symbol">${icon('link')}</div><div><div class="eyebrow">A better way to say “you on?”</div><h2>Make a room. Share the link.</h2><p>Your friends join in the browser. No install, no matching accounts required to try a guest room.</p></div><button class="button button-dark" data-action="quick-room">Create a game room ${icon('arrow')}</button></section>
`;
}

export function renderCatalog() {
  const games = filteredGames();
  return `<section class="catalog-heading"><div><div class="eyebrow">Insert friends here</div><h1>Choose your playground<span>.</span></h1><p>${LIBRARY.length} distinct games. Twelve standalone games and ten room-based classics. No numbered variants. Pick your kind of play.</p></div><button class="button button-primary" data-action="quick-room">${icon('link')} Create invite room</button></section>
    <div class="catalog-toolbar"><div class="filter-pills">${CATEGORIES.map((category) => `<button class="filter-pill ${state.category === category ? 'is-active' : ''}" data-action="filter-category" data-category="${esc(category)}">${esc(category)}${category === 'All games' ? `<i>${LIBRARY.length}</i>` : ''}</button>`).join('')}</div><span class="game-count">SHOWING <b>${games.length}</b> / ${LIBRARY.length}</span></div>
    <div id="catalog-grid">${renderGameGrid(games, 2)}</div>
    <div class="catalog-bottom"><span>Solo games play instantly. Social classics use private invite rooms.</span><button class="text-button" data-action="show-setup">How online play works ${icon('arrow')}</button></div>`;
}

export function getFriendName(friend) {
  const names = friend.memberNames || {};
  const otherUid = (friend.memberUids || []).find((uid) => uid !== state.user?.uid);
  return names[otherUid] || 'Arcade friend';
}

export function getFriendUid(friend) {
  return (friend.memberUids || []).find((uid) => uid !== state.user?.uid) || '';
}

export function renderFriends() {
  const conn = connection();
  const accountReady = Boolean(state.user && !state.user.isAnonymous && state.profile);
  const incoming = state.requests;
  const invites = state.invites;
  return `<section class="friends-heading"><div><div class="eyebrow">Good games are better shared</div><h1>Your crew<span>.</span></h1><p>Add friends by username, then invite them straight into a game room.</p></div><span class="friend-online-label is-${conn.kind}"><i></i> ${esc(conn.label)}</span></section>
    ${conn.setupNeeded ? `<div class="notice-panel notice-warn">${icon('spark')}<div><b>Friends need Firebase.</b><p>${esc(conn.detail)}${conn.hint ? ` ${esc(conn.hint)}` : ''} Local practice still works.</p></div><button class="text-button" data-action="show-setup">Setup steps ${icon('arrow')}</button></div>` : !accountReady ? `<div class="notice-panel">${icon('people')}<div><b>${state.user && !state.user.isAnonymous && isGoogleUser(state.user) ? 'Finish your player setup to add friends.' : 'Make a free arcade account to add friends.'}</b><p>${state.user && !state.user.isAnonymous && isGoogleUser(state.user) ? 'Choose a unique PSD-gaming username first. Your Google account is already confirmed.' : 'Guests can play online with a link. A username account is only needed for friend lists and direct challenges.'}</p></div><button class="button button-primary" data-action="${state.user && !state.user.isAnonymous && isGoogleUser(state.user) ? 'open-username-setup' : 'open-auth'}">${state.user && !state.user.isAnonymous && isGoogleUser(state.user) ? 'Choose username' : 'Create account'} ${icon('arrow')}</button></div>` : ''}
    ${conn.kind === 'offline' ? `<div class="notice-panel notice-warn">${icon('wifi')}<div><b>You’re offline.</b><p>${esc(conn.detail)}</p></div></div>` : ''}
    ${state.socialError ? `<div class="notice-panel notice-warn">${icon('spark')}<div><b>Friends are not available yet.</b><p>${esc(state.socialError)}</p></div><button class="text-button" data-action="show-setup">Setup steps ${icon('arrow')}</button></div>` : ''}
    <div class="social-grid"><section class="surface friend-search-panel"><div class="panel-heading"><div><span class="eyebrow">Find your player two</span><h2>Add by username</h2></div><span class="search-panel-icon">${icon('search')}</span></div><form class="friend-search-form" data-form="friend-search"><label for="friend-username">Arcade username</label><div class="friend-search-row"><span>@</span><input id="friend-username" name="username" type="text" minlength="3" maxlength="18" pattern="[A-Za-z0-9_]{3,18}" placeholder="try pixelpilot" ${accountReady ? '' : 'disabled'} required><button class="button button-primary" type="submit" ${accountReady ? '' : 'disabled'}>Find ${icon('arrow')}</button></div><small>They’ll need an account with a username to show up here.</small></form>
      ${state.friendResults.length ? `<div class="search-results">${state.friendResults.map((profile) => `<div class="search-result"><span class="avatar">${esc(profile.username.slice(0, 1).toUpperCase())}</span><div><b>@${esc(profile.username)}</b><small>Ready for a challenge</small></div><button class="button button-outline button-small" data-action="send-friend-request" data-uid="${esc(profile.uid)}" data-name="${esc(profile.username)}">Add friend ${icon('plus')}</button></div>`).join('')}</div>` : ''}</section>
      <section class="surface incoming-panel"><div class="panel-heading"><div><span class="eyebrow">Your invites</span><h2>Waiting for you <i>${incoming.length + invites.length}</i></h2></div><span class="invite-icon">${icon('bell')}</span></div>
      ${incoming.length || invites.length ? `<div class="invite-list">${incoming.map((request) => `<div class="invite-row"><span class="avatar avatar-purple">${esc((request.fromName || 'P').slice(0, 1).toUpperCase())}</span><div class="invite-row-copy"><b>@${esc(request.fromName || 'player')} wants to connect</b><small>Friend request · ${timeAgo(request.createdAt)}</small></div><button class="button button-primary button-small" data-action="accept-friend" data-request-id="${request.id}">Accept</button><button class="icon-button subtle" data-action="decline-friend" data-request-id="${request.id}" aria-label="Decline request">${icon('close')}</button></div>`).join('')}${invites.map((invite) => `<div class="invite-row"><span class="avatar avatar-cyan">${esc((invite.fromName || 'P').slice(0, 1).toUpperCase())}</span><div class="invite-row-copy"><b>${esc(invite.fromName || 'A friend')} invited you</b><small>${esc(getGame(invite.gameId)?.title || 'A game')} · ${timeAgo(invite.createdAt)}</small></div><button class="button button-primary button-small" data-action="join-game-invite" data-invite-id="${invite.id}" data-room-id="${esc(invite.roomId)}">Join ${icon('arrow')}</button></div>`).join('')}</div>` : `<div class="empty-inline"><span>✦</span><b>It’s quiet in here.</b><small>Friend requests and game invites will land here.</small></div>`}</section>
    </div>
    <section class="surface friends-list-panel"><div class="panel-heading"><div><span class="eyebrow">Your regulars</span><h2>Friends <i>${state.friends.length}</i></h2></div><button class="button button-outline button-small" data-action="navigate" data-page="catalog">Pick a game ${icon('arrow')}</button></div>
      ${state.friends.length ? `<div class="friends-list">${state.friends.map((friend) => `<div class="friend-row"><span class="avatar avatar-${friendColor(friend.id)}">${esc(getFriendName(friend).slice(0, 1).toUpperCase())}</span><div class="friend-row-copy"><b>${esc(getFriendName(friend))}</b><small>Friends since ${dateLabel(friend.createdAt)}</small></div><span class="friend-status"><i></i> Ready</span><button class="button button-outline button-small" data-action="challenge-friend" data-uid="${esc(getFriendUid(friend))}" data-name="${esc(getFriendName(friend))}" data-friendship-id="${esc(friend.id)}">Challenge ${icon('arrow')}</button></div>`).join('')}</div>` : `<div class="empty-inline"><span>◎</span><b>No friends yet</b><small>Find them by username, or send a private game link from any game card.</small></div>`}
    </section>`;
}

export function friendColor(id = '') {
  return ['blue', 'purple', 'cyan', 'green'][Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4];
}

export function timestampDate(timestamp) {
  if (!timestamp) return null;
  if (typeof timestamp.toDate === 'function') return timestamp.toDate();
  if (timestamp.seconds) return new Date(timestamp.seconds * 1000);
  return new Date(timestamp);
}

export function dateLabel(timestamp) {
  const date = timestampDate(timestamp);
  return date ? date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : 'recently';
}

export function timeAgo(timestamp) {
  const date = timestampDate(timestamp);
  if (!date) return 'just now';
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}


/** The five admin studio tabs. */
const ADMIN_TABS = [
  ['overview', 'Overview'],
  ['rooms', 'Rooms'],
  ['players', 'Players'],
  ['social', 'Social'],
  ['access', 'Access'],
];

/** A short, recognisable slice of a Firebase UID. */
function shortUid(uid = '') {
  return uid.length > 10 ? `${uid.slice(0, 6)}…${uid.slice(-3)}` : uid;
}

/** The delete button every destructive admin row shares (confirmations live in src/app.js). */
function adminDeleteButton(action, attrs, label) {
  return `<button class="icon-button subtle is-danger" data-action="${action}" ${attrs} aria-label="${esc(label)}" title="${esc(label)}">${icon('trash')}</button>`;
}

/** Kick chips for the players of a waiting lobby, each with its own confirm behind it. */
function adminRoomPlayers(room) {
  const uids = room.playerUids || [];
  const names = room.playerNames || {};
  return `<div class="admin-chip-row">${uids.map((uid) => {
    const name = names[uid] || 'Player';
    const kick = room.status === 'waiting'
      ? `<button class="chip-kick" data-action="admin-kick-player" data-room-id="${esc(room.id)}" data-uid="${esc(uid)}" data-name="${esc(name)}" aria-label="Kick ${esc(name)} from this lobby" title="Kick from lobby">${icon('close')}</button>`
      : '';
    return `<span class="player-chip">${esc(name)}${uid === room.hostUid ? '<i class="host-chip">Host</i>' : ''}${kick}</span>`;
  }).join('')}</div>`;
}

function renderAdminRoomsTable(rooms, { limitRows = Infinity } = {}) {
  const nowMs = presenceNow();
  const activeRooms = rooms.filter((room) => !isRoomExpired(room, nowMs));
  if (!activeRooms.length) return `<div class="empty-inline"><span>◉</span><b>No rooms yet</b><small>The first private room will show up here.</small></div>`;
  const rows = [...activeRooms]
    .sort((a, b) => (timestampDate(b.createdAt)?.getTime() || 0) - (timestampDate(a.createdAt)?.getTime() || 0))
    .slice(0, limitRows)
    .map((room) => `<tr><td><span class="table-game">${esc(getGame(room.gameId)?.title || room.gameId)}</span></td><td>${adminRoomPlayers(room)}</td><td><span class="status-pill status-${room.status}">${esc(room.status || 'unknown')}</span></td><td>${timeAgo(room.createdAt)}</td><td class="admin-actions">${adminDeleteButton('admin-delete-room', `data-room-id="${esc(room.id)}" data-name="${esc(room.hostName || 'this room')}"`, `Delete the ${esc(getGame(room.gameId)?.title || 'room')} room`)}</td></tr>`)
    .join('');
  return `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th scope="col">Game</th><th scope="col">Players</th><th scope="col">Status</th><th scope="col">Created</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderAdminOverview(data) {
  const nowMs = presenceNow();
  const activeRooms = data.rooms.filter((room) => !isRoomExpired(room, nowMs));
  const pendingRequests = data.requests.filter((request) => request.status === 'pending').length;
  const pendingInvites = data.invites.filter((invite) => invite.status === 'pending' && !isRoomExpired(invite, nowMs)).length;
  const liveRooms = activeRooms.filter((room) => room.status === 'playing').length;
  const metrics = [
    ['Registered players', data.profiles.length, 'Accounts with a username'],
    ['Admins', data.admins.length, 'UIDs with studio access'],
    ['Rooms (latest 100)', activeRooms.length, `${liveRooms} match in progress`],
    ['Friend connections', data.friendships.length, 'Accepted friend links'],
    ['Pending requests', pendingRequests, 'Friend requests unanswered'],
    ['Pending invites', pendingInvites, 'Game invites unanswered'],
  ];
  return `<div class="admin-metrics">${metrics.map(([label, value, hint]) => `<article><span>${esc(label)}</span><b>${state.adminLoading ? '…' : value}</b><small>${esc(hint)}</small></article>`).join('')}</div>
    <div class="admin-grid">
      <section class="surface admin-table-panel"><div class="panel-heading"><div><span class="eyebrow">Live room snapshot</span><h2>Recent rooms</h2></div><button class="text-button" data-action="admin-tab" data-tab="rooms">Manage all ${icon('arrow')}</button></div>${renderAdminRoomsTable(activeRooms, { limitRows: 8 })}</section>
      <aside class="surface admin-powers"><div class="panel-heading"><div><span class="eyebrow">God mode, on</span><h2>What this studio can do</h2></div><span class="admin-live"><i></i> ${LIBRARY.length} games</span></div><ul class="admin-powers-list"><li><b>Rooms:</b> inspect every room, kick anyone from a waiting lobby, delete a room with its heartbeats.</li><li><b>Players:</b> remove a profile and free its username, so repeat offenders cannot hide.</li><li><b>Social:</b> unlink friend pairs, clear stale requests and game invites.</li><li><b>Access:</b> grant and revoke admin flags without opening the Firebase console.</li></ul><div class="notice-panel"><span>${icon('shield')}</span><div><b>Firestore enforces every button.</b><p>Each action above checks <code>admins/{yourUid}.admin == true</code> on the server. A forged flag in someone else's browser cannot touch this data.</p></div></div></aside>
    </div>`;
}

function renderAdminPlayers(data) {
  const adminIds = new Set(data.admins.map((admin) => admin.id));
  const profiles = [...data.profiles].sort((a, b) => (timestampDate(b.createdAt)?.getTime() || 0) - (timestampDate(a.createdAt)?.getTime() || 0));
  if (!profiles.length) return `<div class="empty-inline"><span>◎</span><b>No players yet</b><small>Profiles appear the moment someone claims a username.</small></div>`;
  return `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th scope="col">Player</th><th scope="col">UID</th><th scope="col">Joined</th><th scope="col">Access</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${profiles.map((profile) => {
    const isSelf = profile.uid === state.user?.uid;
    const isAdminRow = adminIds.has(profile.uid);
    const access = isAdminRow ? `<span class="status-pill status-playing">admin</span>` : `<span class="status-pill">player</span>`;
    const actions = [
      `<button class="icon-button subtle" data-action="admin-copy-uid" data-uid="${esc(profile.uid)}" aria-label="Copy the full UID of @${esc(profile.username || 'player')}" title="Copy UID">${icon('copy')}</button>`,
      isAdminRow
        ? isSelf ? '' : `<button class="icon-button subtle is-warn" data-action="admin-revoke" data-uid="${esc(profile.uid)}" data-name="${esc(profile.username || 'player')}" aria-label="Revoke admin access for @${esc(profile.username || 'player')}" title="Revoke admin">${icon('crown')}</button>`
        : `<button class="icon-button subtle" data-action="admin-grant" data-uid="${esc(profile.uid)}" data-name="${esc(profile.username || 'player')}" aria-label="Make @${esc(profile.username || 'player')} an admin" title="Grant admin">${icon('crown')}</button>`,
      isSelf ? '' : adminDeleteButton('admin-remove-player', `data-uid="${esc(profile.uid)}" data-name="${esc(profile.username || 'player')}" data-username="${esc(profile.usernameLower || '')}"`, `Remove @${esc(profile.username || 'player')} and free their username`),
    ].join('');
    return `<tr><td><span class="admin-player"><span class="avatar avatar-${friendColor(profile.uid)}">${esc((profile.username || 'P').slice(0, 1).toUpperCase())}</span><b>@${esc(profile.username || 'player')}</b></span></td><td><code class="uid-chip">${esc(shortUid(profile.uid))}</code></td><td>${dateLabel(profile.createdAt)}</td><td>${access}</td><td class="admin-actions">${actions}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function renderAdminSocial(data) {
  const friendships = data.friendships.length
    ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th scope="col">Pair</th><th scope="col">Since</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${data.friendships.map((link) => {
      const names = link.memberNames || {};
      const pair = (link.memberUids || []).map((uid) => names[uid] || shortUid(uid)).join(' & ');
      return `<tr><td><b>${esc(pair)}</b></td><td>${dateLabel(link.createdAt)}</td><td class="admin-actions">${adminDeleteButton('admin-delete-friendship', `data-friendship-id="${esc(link.id)}" data-name="${esc(pair)}"`, `Unlink ${esc(pair)}`)}</td></tr>`;
    }).join('')}</tbody></table></div>`
    : `<div class="empty-inline"><span>◎</span><b>No friend links yet</b><small>Accepted requests form links here.</small></div>`;
  const requests = data.requests.length
    ? `<div class="admin-list">${data.requests.map((request) => `<div class="admin-list-row"><div><b>@${esc(request.fromName || 'player')}</b> → <b>@${esc(request.toName || 'player')}</b><small class="admin-dim">${esc(request.status || 'pending')} · ${timeAgo(request.createdAt)}</small></div>${adminDeleteButton('admin-delete-request', `data-request-id="${esc(request.id)}" data-name="@${esc(request.fromName || '?')} → @${esc(request.toName || '?')}"`, 'Delete this friend request')}</div>`).join('')}</div>`
    : `<div class="empty-inline"><span>✦</span><b>No friend requests</b><small>Nothing unanswered or declined right now.</small></div>`;
  const invites = data.invites.length
    ? `<div class="admin-list">${data.invites.map((invite) => `<div class="admin-list-row"><div><b>@${esc(invite.fromName || 'player')}</b> invited <b>@${esc(invite.toName || 'player')}</b><small class="admin-dim">${esc(getGame(invite.gameId)?.title || 'A game')} · ${esc(invite.status || 'pending')} · ${timeAgo(invite.createdAt)}</small></div>${adminDeleteButton('admin-delete-invite', `data-invite-id="${esc(invite.id)}" data-name="${esc(getGame(invite.gameId)?.title || 'game invite')}"`, 'Delete this game invite')}</div>`).join('')}</div>`
    : `<div class="empty-inline"><span>✦</span><b>No game invites</b><small>Direct challenges will land here.</small></div>`;
  return `<section class="surface admin-table-panel"><div class="panel-heading"><div><span class="eyebrow">The friend graph</span><h2>Friend links <i>${data.friendships.length}</i></h2></div></div>${friendships}</section>
    <div class="admin-grid"><section class="surface admin-table-panel"><div class="panel-heading"><div><span class="eyebrow">Inbox traffic</span><h2>Friend requests <i>${data.requests.length}</i></h2></div></div>${requests}</section>
    <section class="surface admin-table-panel"><div class="panel-heading"><div><span class="eyebrow">Direct challenges</span><h2>Game invites <i>${data.invites.length}</i></h2></div></div>${invites}</section></div>`;
}

function renderAdminAccess(data) {
  const profileNames = new Map(data.profiles.map((profile) => [profile.uid, profile.username]));
  const admins = data.admins.length
    ? `<div class="admin-list">${data.admins.map((admin) => {
      const isSelf = admin.id === state.user?.uid;
      const name = profileNames.get(admin.id);
      return `<div class="admin-list-row"><div><b>${esc(name ? `@${name}` : shortUid(admin.id))} ${isSelf ? '<span class="status-pill status-playing">you</span>' : ''}</b><small class="admin-dim"><code class="uid-chip">${esc(shortUid(admin.id))}</code> · full studio access</small></div>${isSelf ? `<span class="admin-dim">Self-lockout is blocked by the rules</span>` : `<button class="button button-outline button-small" data-action="admin-revoke" data-uid="${esc(admin.id)}" data-name="${esc(name || shortUid(admin.id))}">${icon('crown')} Revoke</button>`}</div>`;
    }).join('')}</div>`
    : `<div class="empty-inline"><span>◉</span><b>No admins?!</b><small>You are reading this page, so one flag exists - refresh may be behind.</small></div>`;
  return `<div class="admin-grid"><section class="surface admin-table-panel"><div class="panel-heading"><div><span class="eyebrow">Who holds the keys</span><h2>Admin access <i>${data.admins.length}</i></h2></div></div>${admins}
    <div class="admin-grant-panel"><div class="eyebrow">Promote someone</div><form data-form="admin-grant"><label for="admin-uid-input">Firebase user UID<div class="admin-grant-row"><input id="admin-uid-input" name="uid" type="text" minlength="8" maxlength="64" placeholder="kR8vN…b2z" required autocomplete="off"><button class="button button-primary" type="submit">${icon('crown')} Make admin</button></div></label><small>Find UIDs under Firebase Console → Authentication → Users, or copy one from the Players tab. Their studio appears on next refresh.</small></form></div></section>
    <aside class="surface admin-powers"><div class="panel-heading"><div><span class="eyebrow">Safety rails</span><h2>Still enforced by Firestore</h2></div><span>${icon('shield')}</span></div><ul class="admin-powers-list"><li>Nobody can mint their first flag from the client - the <b>first</b> admin is still created in the Firebase console.</li><li>A flag document can only ever contain <code>admin: true/false</code>, nothing else.</li><li>You cannot revoke yourself (rules block it), so the studio can never lock itself out.</li><li>Revoked admins lose access the moment their token refreshes.</li></ul></aside></div>`;
}

export function renderAdmin() {
  if (!state.isAdmin) return `<section class="admin-denied"><span>${icon('shield')}</span><h1>Restricted area</h1><p>This Firebase account is not marked as an administrator.</p><button class="button button-primary" data-action="navigate" data-page="home">Back to the arcade</button></section>`;
  const data = state.adminData;
  const tab = ADMIN_TABS.some(([id]) => id === state.adminTab) ? state.adminTab : 'overview';
  const tabs = ADMIN_TABS.map(([id, label]) => `<button class="filter-pill ${tab === id ? 'is-active' : ''}" data-action="admin-tab" data-tab="${id}">${label}</button>`).join('');
  const activeRooms = data?.rooms ? data.rooms.filter((room) => !isRoomExpired(room, presenceNow())) : [];
  let body;
  if (!data) body = `<div class="empty-inline"><b>Loading the control room…</b></div>`;
  else if (data.error) body = `<div class="notice-panel notice-warn">${esc(data.error)}</div>`;
  else if (tab === 'rooms') body = `<section class="surface admin-table-panel"><div class="panel-heading"><div><span class="eyebrow">Every private room</span><h2>Rooms <i>${activeRooms.length}</i></h2></div><span class="admin-live"><i></i> latest 100 · 1h auto-delete</span></div>${renderAdminRoomsTable(activeRooms)}</section>`;
  else if (tab === 'players') body = `<section class="surface admin-table-panel"><div class="panel-heading"><div><span class="eyebrow">Everyone who claimed a name</span><h2>Players <i>${data.profiles.length}</i></h2></div><span class="admin-live"><i></i> latest 300</span></div>${renderAdminPlayers(data)}</section>`;
  else if (tab === 'social') body = renderAdminSocial(data);
  else if (tab === 'access') body = renderAdminAccess(data);
  else body = renderAdminOverview(data);
  return `<section class="admin-heading"><div><div class="eyebrow">Private admin area · UID verified · god mode</div><h1>Arcade control<span>.</span></h1><p>Only accounts with <code>admins/{uid}.admin = true</code> can see this workspace - and Firestore re-checks the flag on every action.</p></div><button class="button button-outline" data-action="refresh-admin">${icon('spark')} Refresh data</button></section>
    <div class="filter-pills admin-tabs" role="tablist" aria-label="Admin sections">${tabs}</div>
    ${state.adminLoading && data && !data.error ? `<div class="admin-refreshing"><i></i> Syncing with Firestore…</div>` : ''}
    ${body}`;
}

export function renderRoom() {
  if (!firebaseReady) return `<section class="room-error"><div class="error-badge">!</div><div class="eyebrow">Online arcade setup needed</div><h1>Can’t open this room yet.</h1><p>${esc(connection().detail)} Once the owner fixes that, open the same invite link again.</p>${firebaseSetup.hint ? `<p class="room-error-hint">${esc(firebaseSetup.hint)}</p>` : ''}<div class="room-error-actions"><button class="button button-primary" data-action="show-setup">Show exact setup steps ${icon('arrow')}</button><button class="button button-outline" data-action="navigate" data-page="catalog">Practice locally</button></div></section>`;
  if (state.roomError) return `<section class="room-error"><div class="error-badge">!</div><div class="eyebrow">Room link</div><h1>We couldn’t join this room.</h1><p>${esc(state.roomError)}</p><div class="room-error-actions"><button class="button button-primary" data-action="retry-room">Try again ${icon('arrow')}</button><button class="button button-outline" data-action="navigate" data-page="catalog">Back to games</button></div></section>`;
  if (!state.room) return `<section class="room-loading"><span class="loader"></span><div class="eyebrow">Connecting to your room</div><h1>Finding the arcade…</h1><p>Joining as a guest. You can choose an account later.</p></section>`;
  const game = getGame(state.room.gameId);
  if (!game) return `<section class="room-error"><h1>Unknown game room.</h1><button class="button button-primary" data-action="navigate" data-page="catalog">Back to game shelf</button></section>`;
  if (state.room.status === 'waiting') return renderLobby(game, state.room);
  return renderGameScreen();
}

/**
 * The "is the host still here?" line under the Start button, for everyone who is not the host.
 * @param {{ hostName?: string, hostUid: string }} room
 * @param {Record<string, import('../presence-status.js').PresenceVerdict>} presence
 */
export function renderHostWait(room, presence) {
  const host = esc(room.hostName || 'the host');
  const verdict = presence[room.hostUid];
  const note = verdict?.kind === 'away'
    ? `<em>${host} has been away for ${esc(formatAwayFor(verdict.awayForMs || 0))}. You can wait, or leave the room.</em>`
    : verdict?.kind === 'left'
      ? `<em>${host} left the room. You can wait for them to come back, or leave.</em>`
      : '';
  return `<span class="host-wait ${verdict ? `is-${verdict.kind}` : ''}">Waiting for <b>${host}</b> to start…${note}</span>`;
}

export function renderLobby(game, room) {
  const players = currentPlayers();
  const presence = currentPresence();
  const isHost = state.user?.uid === room.hostUid;
  return `<div class="lobby-topline"><button class="text-button" data-action="leave-room">${icon('exit')} Leave room</button><span class="room-code">Room <b>${esc(room.id.slice(0, 7).toUpperCase())}</b></span><span class="private-tag"><i></i> Private room</span></div>
    <section class="lobby-hero"><div class="lobby-art art-${game.accent}">${artImage(getGameArtwork(game), { className: 'lobby-art-image', sizes: '(min-width: 900px) 50vw, 100vw' })}<div class="lobby-art-label">${esc(getGameArtwork(game).engineLabel)}</div></div><div class="lobby-copy"><div class="eyebrow">You’re in the right place</div><h1>${esc(game.title)}<span>.</span></h1><p>${esc(game.blurb)} Invite one or two people and the game is on.</p><div class="lobby-badges"><span>${icon('people')} 2–${room.maxPlayers} players</span><span>${icon('link')} Invite-only</span><span>${icon('gamepad')} Browser game</span></div><div class="lobby-actions"><button class="button button-primary" data-action="copy-room-link">${icon('copy')} Copy invite link</button><button class="button button-outline" data-action="share-room-link">${icon('link')} Share</button>${isHost ? `<button class="button button-glow" data-action="start-room" ${players.length < 2 ? 'disabled' : ''}>Start match ${icon('arrow')}</button>` : renderHostWait(room, presence)}</div><small class="lobby-hint">${players.length < 2 ? 'Share the link with at least one friend to unlock Start match.' : `All set. ${isHost ? 'Start when your crew is ready.' : 'The host can start the match now.'}`}</small></div></section>
    <section class="lobby-players"><div class="panel-heading"><div><span class="eyebrow">The lobby</span><h2>Players ready <i>${players.length} / ${room.maxPlayers}</i></h2></div><span class="lobby-live"><i></i> Link sharing on</span></div><div class="player-slot-grid">${Array.from({ length: room.maxPlayers }, (_, index) => players[index] ? `<article class="player-slot is-filled"><span class="slot-avatar slot-${index}">${esc(players[index].name.slice(0, 1).toUpperCase())}</span><span class="slot-label">Player ${index + 1}</span><b>${esc(players[index].name)}${players[index].uid === room.hostUid ? `<i class="host-chip">Host</i>` : ''}</b><small class="slot-presence is-${presence[players[index].uid]?.kind || 'unknown'}"><i></i> ${esc(presence[players[index].uid]?.label || 'IN THE ROOM')}</small></article>` : `<article class="player-slot is-empty"><span class="slot-avatar">+</span><span class="slot-label">Player ${index + 1}</span><b>Waiting for a friend</b><small>Share your invite link</small></article>`).join('')}</div></section>
    <section class="lobby-bottom"><div><b>Playing from different places?</b><span>That’s the point. Your moves sync to everyone in the room.</span></div><button class="text-button" data-action="copy-room-link">Copy link again ${icon('arrow')}</button></section>`;
}

export function renderHowToPlay(game) {
  const guide = getGameGuide(game);
  if (!guide) return '';
  return `<details class="how-to-play"><summary><span class="how-to-icon">?</span><span><b>How to play</b><small>${esc(guide.mode)}</small></span><i>⌄</i></summary><div class="how-to-content"><div><span class="eyebrow">Goal</span><p>${esc(guide.goal)}</p></div><div><span class="eyebrow">Controls</span><p>${esc(guide.controls)}</p></div><div><span class="eyebrow">Rules</span><p>${esc(guide.rules)}</p></div><kbd>${esc(guide.shortcut)}</kbd></div></details>`;
}

export function renderGameScreen() {
  const game = currentGame();
  const gameState = currentGameState();
  const players = currentPlayers();
  if (!game || !gameState) return `<section class="room-loading"><span class="loader"></span><div class="eyebrow">Loading game</div><h1>Setting up the cabinet…</h1></section>`;
  const me = currentUid();
  const presence = currentPresence();
  const isTurn = !gameState.turnUid || gameState.turnUid === me;
  const turnPresence = gameState.turnUid ? presence[gameState.turnUid] : undefined;
  const turnNote = turnPresence?.kind === 'away' ? ` · away ${formatAwayFor(turnPresence.awayForMs || 0)}` : turnPresence?.kind === 'left' ? ' · left the room' : '';
  const pendingActions = state.local ? 0 : state.onlineActionsPending;
  const syncLabel = pendingActions
    ? `Applied instantly · syncing ${pendingActions} ${pendingActions === 1 ? 'move' : 'moves'}…`
    : 'Instant moves · live sync ready';
  const statusText = gameState.phase === 'finished'
    ? gameState.winnerUid ? `${activeName(gameState.winnerUid, players)} takes the round` : 'That’s a draw'
    : isTurn ? 'Your move' : `${activeName(gameState.turnUid, players)} is up${turnNote}`;
  return `<div class="play-topline"><button class="text-button" data-action="leave-session">${icon('exit')} Leave game</button><div class="playing-label"><span class="playing-pulse"></span>${state.local ? 'Local practice' : 'Live room'} <i>·</i> ${esc(game.category)}</div><span class="room-code">${state.local ? 'Practice' : `Room ${esc((state.room?.id || '').slice(0, 7).toUpperCase())}`}</span></div>
    <div class="play-layout"><section class="game-stage surface"><div class="game-stage-heading" style="--stage-art:url('${esc(stageArt(game))}')"><div class="game-stage-title"><span class="game-mini-icon art-${game.accent}">${esc(game.icon)}</span><div><div class="eyebrow">${esc(game.category)} · Round ${gameState.round || gameState.questionIndex + 1 || 1}</div><h1>${esc(game.title)}</h1></div></div><div class="turn-chip ${gameState.phase === 'finished' ? 'is-finished' : ''}"><span></span>${esc(statusText)}</div></div>
      ${renderHowToPlay(game)}
      ${renderEngineBoard(game, gameState, players, me)}
      <div class="stage-foot">${gameState.phase === 'finished' ? `<div class="result-banner ${gameState.winnerUid === me ? 'is-win' : ''}"><span class="result-mark">${gameState.winnerUid === me ? '✦' : gameState.winnerUid ? '◉' : '＝'}</span><div><b>${gameState.winnerUid ? (gameState.winnerUid === me ? 'Nice one — you win!' : `${esc(activeName(gameState.winnerUid, players))} wins this one.`) : 'A perfectly even match.'}</b><small>${gameState.result === 'draw' ? 'Run it back and settle the score.' : 'Well played. Fancy another round?'}</small></div><button class="button button-outline button-small" data-action="play-again" ${pendingActions ? 'disabled title="Finishing sync…"' : ''}>${pendingActions ? 'Syncing…' : 'Play again'} ${icon('arrow')}</button></div>` : `<div class="game-stage-footer"><span>${icon('spark')} ${esc(game.blurb)}</span>${state.local ? '<span>Moves apply instantly on this device</span>' : `<span class="move-sync ${pendingActions ? 'is-syncing' : ''}"><i></i>${esc(syncLabel)}</span>`}</div>`}</div>
    </section><aside class="match-rail surface" aria-label="Match players"><div class="match-rail-heading"><div><span class="eyebrow">Match room</span><h2>The players</h2></div><span class="live-tag is-${state.local ? 'local' : state.online ? 'live' : 'offline'}"><i></i> ${state.local ? 'Local' : state.online ? 'Live' : 'Offline'}</span></div><div class="match-player-list">${players.map((player, index) => `<div class="match-player ${player.uid === me ? 'is-me' : ''} ${gameState.turnUid === player.uid ? 'is-turn' : ''} ${presence[player.uid] ? `is-${presence[player.uid].kind}` : ''}"><span class="match-player-avatar player-avatar-${index}">${player.uid === 'local-cpu' ? 'CPU' : esc(player.name.slice(0, 1).toUpperCase())}</span><span class="match-player-copy"><b>${esc(player.name)} ${player.uid === me ? '<i>You</i>' : ''}</b><small>${presence[player.uid]?.detail ? esc(presence[player.uid].detail) : gameState.turnUid === player.uid && gameState.phase !== 'finished' ? 'Playing now' : player.uid === state.room?.hostUid ? 'Room host' : 'In the match'}</small></span>${gameState.scores ? `<strong>${gameState.scores[player.uid] || 0}<small>pts</small></strong>` : gameState.turnUid === player.uid ? `<span class="player-turn-dot"></span>` : ''}</div>`).join('')}</div>
      ${state.local ? `<div class="rail-note"><span>${icon('spark')}</span><div><b>Just you and the browser.</b><small>Want a real rival? Create a room and send a link.</small></div></div><button class="button button-primary rail-main-button" data-action="quick-room">Invite a friend ${icon('arrow')}</button>` : `<div class="room-share-card"><span class="eyebrow">Bring in another player</span><p>Send the room link. They can join as a guest.</p><div class="room-share-actions"><button class="button button-outline" data-action="copy-room-link">${icon('copy')} Copy room link</button><button class="button button-quiet" data-action="share-room-link">${icon('link')} Share</button></div></div>`}
      <button class="text-button rail-back" data-action="navigate" data-page="catalog">Back to game shelf ${icon('arrow')}</button></aside></div>`;
}
