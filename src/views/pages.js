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

import { CATEGORIES, GAME_COVERS, GAMES, getGame, getGameArtwork, getGameGuide } from '../catalog.js';
import { connection } from '../connection.js';
import { firebaseReady, firebaseSetup } from '../firebase.js';
import { state, currentGame, currentGameState, currentPlayers, currentUid } from '../state.js';
import { esc, icon } from '../ui/html.js';
import { activeName, isGoogleUser } from '../ui/players.js';
import { renderEngineBoard } from './boards.js';

export function renderGameCard(game, index = 0, aboveFold = false) {
  const artwork = getGameArtwork(game);
  const isFavorite = state.favorites.includes(game.id);
  return `<article class="game-card" style="--card-accent:var(--${game.accent || 'blue'});--card-index:${index}">
    <button class="game-card-hit" data-action="open-game" data-game-id="${game.id}" aria-label="Open ${esc(game.title)}">
      <div class="game-art art-${game.accent || 'blue'}"><img class="game-art-image" src="${artwork.src}" alt="" aria-hidden="true" loading="${aboveFold && index < 4 ? 'eager' : 'lazy'}" style="object-position:${artwork.focal}" onerror="this.classList.add('is-failed')"><div class="art-shade"></div><div class="art-scanlines"></div><div class="art-meta"><span>${esc(game.category.toUpperCase())}</span><span class="art-players">2–3 <i>PLAYERS</i></span></div><div class="art-sigil">${esc(game.icon)}</div><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><div class="art-stamp">${esc(artwork.engineLabel)}<br>PSD ARCADE</div><div class="art-bottomline"><span>NO DOWNLOAD</span><span>↗</span></div></div>
      <div class="game-card-copy"><div><h3>${esc(game.title)}</h3><p>${esc(game.blurb)}</p></div><span class="card-play">${icon('arrow')}</span></div>
    </button>
    <button class="favorite-button ${isFavorite ? 'is-favorite' : ''}" data-action="toggle-favorite" data-game-id="${game.id}" aria-label="${isFavorite ? 'Remove' : 'Add'} ${esc(game.title)} ${isFavorite ? 'from' : 'to'} favorites" aria-pressed="${isFavorite}">${isFavorite ? '★' : '☆'}</button>
  </article>`;
}

export function renderGameGrid(games, aboveFold = false) {
  if (!games.length) return `<div class="empty-state"><div class="empty-icon">⌕</div><h3>No games found</h3><p>Try another name or switch the category filter.</p><button class="button button-outline" data-action="clear-filters">Clear filters</button></div>`;
  return `<div class="game-grid">${games.map((game, index) => renderGameCard(game, index, aboveFold)).join('')}</div>`;
}

export function gamesForIds(ids) {
  return ids.map((id) => getGame(id)).filter(Boolean);
}

export function renderPersonalShelves() {
  const favoriteGames = gamesForIds(state.favorites).slice(0, 4);
  const recentGames = gamesForIds(state.recentGames).slice(0, 4);
  if (!favoriteGames.length && !recentGames.length) return '';
  return `<section class="personal-shelves"><div class="personal-shelf-head"><div><div class="eyebrow">YOUR SHORTLIST</div><h2>Keep the good ones close<span>.</span></h2><p>Favorites and recent games stay on this device, no extra account data required.</p></div><button class="text-button" data-action="navigate" data-page="catalog">Open the full shelf ${icon('arrow')}</button></div>${favoriteGames.length ? `<div class="personal-shelf"><div class="shelf-label"><span>★ FAVORITES</span><b>${favoriteGames.length}</b></div>${renderGameGrid(favoriteGames)}</div>` : ''}${recentGames.length ? `<div class="personal-shelf"><div class="shelf-label"><span>↺ RECENTLY PLAYED</span><b>${recentGames.length}</b></div>${renderGameGrid(recentGames)}</div>` : ''}</section>`;
}

export function filteredGames() {
  const term = state.query.trim().toLowerCase();
  return GAMES.filter((game) => (state.category === 'All games' || game.category === state.category)
    && (!term || `${game.title} ${game.category} ${game.blurb}`.toLowerCase().includes(term)));
}

export function renderSetupCallout(conn = connection()) {
  if (!conn.setupNeeded) return '';
  return `<aside class="setup-callout is-alert" aria-label="Firebase setup needed">${icon('spark')}<span><b>${esc(conn.detail)}</b>${conn.hint ? ` <small>${esc(conn.hint)}</small>` : ''}<small>Online rooms, accounts and friends are off until this is fixed. Local practice works.</small></span><button data-action="show-setup">Setup guide ${icon('arrow')}</button></aside>`;
}

export function renderHome() {
  const featured = GAMES.slice(0, 4);
  const conn = connection();
  return `<section class="hero-panel">
    <img class="hero-artwork" src="${GAME_COVERS.Hero}" alt="" aria-hidden="true" fetchpriority="high" onerror="this.classList.add('is-failed')">
    <div class="hero-glow hero-glow-one"></div><div class="hero-glow hero-glow-two"></div><div class="hero-gridlines"></div>
    <div class="hero-copy"><div class="hero-kicker"><span class="live-pulse is-${conn.kind}"></span>${esc(conn.label.toUpperCase())}<i>·</i> ZERO DOWNLOADS</div><h1>Your arcade.<br><em>Everywhere.</em></h1><p>Forty bite-size retro games. Your people on the other side of the link. That’s the whole setup.</p><div class="hero-actions"><button class="button button-primary" data-action="navigate" data-page="catalog">Explore all 40 games ${icon('arrow')}</button><button class="button button-glass" data-action="open-friends">Play with friends ${icon('people')}</button></div><div class="hero-footnote"><span class="tiny-avatar-stack"><i>✦</i><i>◉</i><i>▣</i></span><span>Made for <b>2–3 players</b> · works on laptops & phones</span></div></div>
    <div class="hero-console" aria-hidden="true"><div class="console-glow"></div><div class="console-top"><span class="console-led"></span><span>PSD / POCKET ARCADE</span><span>01:08</span></div><div class="console-screen"><div class="screen-stars">✦ &nbsp; · &nbsp; ✧ &nbsp; ·</div><div class="screen-title">READY<br><b>PLAYER 2?</b></div><div class="screen-versus"><span class="screen-player"><i>✕</i><small>YOU</small></span><span class="versus-line"><b>VS</b></span><span class="screen-player"><i>◯</i><small>FRIEND</small></span></div><div class="screen-bar"><i></i></div><small class="screen-footer">LINK UP · LOAD IN · PLAY ON</small></div><div class="console-controls"><span class="d-pad"><i></i><b></b></span><span class="console-speaker">•••<br>•••<br>•••</span><span class="console-buttons"><i>A</i><i>B</i></span></div><div class="console-foot">NO CART. NO CABLE. JUST THE LINK.</div></div>
    <div class="hero-edge-tag">P S D <span>·</span> 2026</div>
  </section>
  ${renderSetupCallout(conn)}
  <section class="stat-strip" aria-label="Arcade facts"><div><b>40</b><span>tiny game worlds</span></div><i></i><div><b>2–3</b><span>players per room</span></div><i></i><div><b>0</b><span>downloads required</span></div><div class="stat-right">DESIGNED FOR THE DISTANCE <span>↗</span></div></section>
  <section class="section-block featured-section"><div class="section-heading"><div><div class="eyebrow">PICK UP AND PLAY</div><h2>Start with a classic<span>.</span></h2><p>Easy to learn. Hard to leave the lobby.</p></div><button class="text-button" data-action="navigate" data-page="catalog">Browse all 40 ${icon('arrow')}</button></div>${renderGameGrid(featured, true)}</section>
  ${renderPersonalShelves()}
  <section class="invite-banner"><div class="invite-symbol">${icon('link')}</div><div><div class="eyebrow">A BETTER WAY TO SAY “YOU ON?”</div><h2>Make a room. Share the link.</h2><p>Your friends join in the browser. No install, no matching accounts required to try a guest room.</p></div><button class="button button-dark" data-action="quick-room">Create a game room ${icon('arrow')}</button></section>
`;
}

export function renderCatalog() {
  const games = filteredGames();
  return `<section class="catalog-heading"><div><div class="eyebrow">INSERT FRIENDS HERE</div><h1>The game shelf<span>.</span></h1><p>Every game runs in your browser and supports 2–3 players in a shared room.</p></div><button class="button button-primary" data-action="quick-room">${icon('link')} Create invite room</button></section>
    <div class="catalog-toolbar"><div class="filter-pills">${CATEGORIES.map((category) => `<button class="filter-pill ${state.category === category ? 'is-active' : ''}" data-action="filter-category" data-category="${esc(category)}">${esc(category)}${category === 'All games' ? `<i>${GAMES.length}</i>` : ''}</button>`).join('')}</div><span class="game-count">SHOWING <b>${games.length}</b> / ${GAMES.length}</span></div>
    <div id="catalog-grid">${renderGameGrid(games)}</div>
    <div class="catalog-bottom"><span>Every room is private by invite link.</span><button class="text-button" data-action="show-setup">How online play works ${icon('arrow')}</button></div>`;
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
  return `<section class="friends-heading"><div><div class="eyebrow">GOOD GAMES ARE BETTER SHARED</div><h1>Your crew<span>.</span></h1><p>Add friends by username, then invite them straight into a game room.</p></div><span class="friend-online-label is-${conn.kind}"><i></i> ${esc(conn.label.toUpperCase())}</span></section>
    ${conn.setupNeeded ? `<div class="notice-panel notice-warn">${icon('spark')}<div><b>Friends need Firebase.</b><p>${esc(conn.detail)}${conn.hint ? ` ${esc(conn.hint)}` : ''} Local practice still works.</p></div><button class="text-button" data-action="show-setup">Setup steps ${icon('arrow')}</button></div>` : !accountReady ? `<div class="notice-panel">${icon('people')}<div><b>${state.user && !state.user.isAnonymous && isGoogleUser(state.user) ? 'Finish your player setup to add friends.' : 'Make a free arcade account to add friends.'}</b><p>${state.user && !state.user.isAnonymous && isGoogleUser(state.user) ? 'Choose a unique PSD-gaming username first. Your Google account is already confirmed.' : 'Guests can play online with a link. A username account is only needed for friend lists and direct challenges.'}</p></div><button class="button button-primary" data-action="${state.user && !state.user.isAnonymous && isGoogleUser(state.user) ? 'open-username-setup' : 'open-auth'}">${state.user && !state.user.isAnonymous && isGoogleUser(state.user) ? 'Choose username' : 'Create account'} ${icon('arrow')}</button></div>` : ''}
    ${conn.kind === 'offline' ? `<div class="notice-panel notice-warn">${icon('wifi')}<div><b>You’re offline.</b><p>${esc(conn.detail)}</p></div></div>` : ''}
    ${state.socialError ? `<div class="notice-panel notice-warn">${icon('spark')}<div><b>Friends are not available yet.</b><p>${esc(state.socialError)}</p></div><button class="text-button" data-action="show-setup">Setup steps ${icon('arrow')}</button></div>` : ''}
    <div class="social-grid"><section class="surface friend-search-panel"><div class="panel-heading"><div><span class="eyebrow">FIND YOUR PLAYER TWO</span><h2>Add by username</h2></div><span class="search-panel-icon">${icon('search')}</span></div><form class="friend-search-form" data-form="friend-search"><label for="friend-username">ARCADE USERNAME</label><div class="friend-search-row"><span>@</span><input id="friend-username" name="username" type="text" minlength="3" maxlength="18" pattern="[A-Za-z0-9_]{3,18}" placeholder="try pixelpilot" ${accountReady ? '' : 'disabled'} required><button class="button button-primary" type="submit" ${accountReady ? '' : 'disabled'}>Find ${icon('arrow')}</button></div><small>They’ll need an account with a username to show up here.</small></form>
      ${state.friendResults.length ? `<div class="search-results">${state.friendResults.map((profile) => `<div class="search-result"><span class="avatar">${esc(profile.username.slice(0, 1).toUpperCase())}</span><div><b>@${esc(profile.username)}</b><small>Ready for a challenge</small></div><button class="button button-outline button-small" data-action="send-friend-request" data-uid="${esc(profile.uid)}" data-name="${esc(profile.username)}">Add friend ${icon('plus')}</button></div>`).join('')}</div>` : ''}</section>
      <section class="surface incoming-panel"><div class="panel-heading"><div><span class="eyebrow">YOUR INVITES</span><h2>Waiting for you <i>${incoming.length + invites.length}</i></h2></div><span class="invite-icon">${icon('bell')}</span></div>
      ${incoming.length || invites.length ? `<div class="invite-list">${incoming.map((request) => `<div class="invite-row"><span class="avatar avatar-purple">${esc((request.fromName || 'P').slice(0, 1).toUpperCase())}</span><div class="invite-row-copy"><b>@${esc(request.fromName || 'player')} wants to connect</b><small>Friend request · ${timeAgo(request.createdAt)}</small></div><button class="button button-primary button-small" data-action="accept-friend" data-request-id="${request.id}">Accept</button><button class="icon-button subtle" data-action="decline-friend" data-request-id="${request.id}" aria-label="Decline request">${icon('close')}</button></div>`).join('')}${invites.map((invite) => `<div class="invite-row"><span class="avatar avatar-cyan">${esc((invite.fromName || 'P').slice(0, 1).toUpperCase())}</span><div class="invite-row-copy"><b>${esc(invite.fromName || 'A friend')} invited you</b><small>${esc(getGame(invite.gameId)?.title || 'A game')} · ${timeAgo(invite.createdAt)}</small></div><button class="button button-primary button-small" data-action="join-game-invite" data-invite-id="${invite.id}" data-room-id="${esc(invite.roomId)}">Join ${icon('arrow')}</button></div>`).join('')}</div>` : `<div class="empty-inline"><span>✦</span><b>It’s quiet in here.</b><small>Friend requests and game invites will land here.</small></div>`}</section>
    </div>
    <section class="surface friends-list-panel"><div class="panel-heading"><div><span class="eyebrow">YOUR REGULARS</span><h2>Friends <i>${state.friends.length}</i></h2></div><button class="button button-outline button-small" data-action="navigate" data-page="catalog">Pick a game ${icon('arrow')}</button></div>
      ${state.friends.length ? `<div class="friends-list">${state.friends.map((friend) => `<div class="friend-row"><span class="avatar avatar-${friendColor(friend.id)}">${esc(getFriendName(friend).slice(0, 1).toUpperCase())}</span><div class="friend-row-copy"><b>${esc(getFriendName(friend))}</b><small>Friends since ${dateLabel(friend.createdAt)}</small></div><span class="friend-status"><i></i> READY</span><button class="button button-outline button-small" data-action="challenge-friend" data-uid="${esc(getFriendUid(friend))}" data-name="${esc(getFriendName(friend))}" data-friendship-id="${esc(friend.id)}">Challenge ${icon('arrow')}</button></div>`).join('')}</div>` : `<div class="empty-inline"><span>◎</span><b>No friends yet</b><small>Find them by username, or send a private game link from any game card.</small></div>`}
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


export function renderAdmin() {
  if (!state.isAdmin) return `<section class="admin-denied"><span>${icon('shield')}</span><h1>Restricted area</h1><p>This Firebase account is not marked as an administrator.</p><button class="button button-primary" data-action="navigate" data-page="home">Back to the arcade</button></section>`;
  const data = state.adminData;
  return `<section class="admin-heading"><div><div class="eyebrow">PRIVATE ADMIN AREA · UID VERIFIED</div><h1>Arcade control<span>.</span></h1><p>Only accounts with <code>admins/{uid}.admin = true</code> can see this workspace.</p></div><button class="button button-outline" data-action="refresh-admin">${icon('spark')} Refresh data</button></section>
    <div class="admin-metrics"><article><span>REGISTERED PLAYERS</span><b>${state.adminLoading ? '…' : data?.profiles ?? '—'}</b><small>Profiles currently readable</small></article><article><span>FRIEND CONNECTIONS</span><b>${state.adminLoading ? '…' : data?.friendships ?? '—'}</b><small>Accepted friend links</small></article><article><span>ROOMS (LATEST 50)</span><b>${state.adminLoading ? '…' : data?.rooms?.length ?? '—'}</b><small>Recent private rooms</small></article><article><span>CATALOG</span><b>${GAMES.length}</b><small>Browser-ready game modes</small></article></div>
    <section class="surface admin-table-panel"><div class="panel-heading"><div><span class="eyebrow">LIVE ROOM SNAPSHOT</span><h2>Recent rooms</h2></div><span class="admin-live"><i></i> FIRESTORE</span></div>${state.adminLoading ? `<div class="empty-inline"><b>Loading arcade stats…</b></div>` : data?.error ? `<div class="notice-panel notice-warn">${esc(data.error)}</div>` : data?.rooms?.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>GAME</th><th>HOST</th><th>PLAYERS</th><th>STATUS</th><th>CREATED</th></tr></thead><tbody>${data.rooms.sort((a, b) => (timestampDate(b.createdAt)?.getTime() || 0) - (timestampDate(a.createdAt)?.getTime() || 0)).slice(0, 20).map((room) => `<tr><td><span class="table-game">${esc(getGame(room.gameId)?.title || room.gameId)}</span></td><td>${esc(room.hostName || 'Player')}</td><td>${(room.playerUids || []).length} / ${room.maxPlayers || 2}</td><td><span class="status-pill status-${room.status}">${esc(room.status || 'unknown')}</span></td><td>${timeAgo(room.createdAt)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-inline"><span>◉</span><b>No rooms yet</b><small>The first private room will show up here.</small></div>`}</section>`;
}

export function renderRoom() {
  if (!firebaseReady) return `<section class="room-error"><div class="error-badge">!</div><div class="eyebrow">ONLINE ARCADE SETUP NEEDED</div><h1>Can’t open this room yet.</h1><p>${esc(connection().detail)} Once the owner fixes that, open the same invite link again.</p>${firebaseSetup.hint ? `<p class="room-error-hint">${esc(firebaseSetup.hint)}</p>` : ''}<div class="room-error-actions"><button class="button button-primary" data-action="show-setup">Show exact setup steps ${icon('arrow')}</button><button class="button button-outline" data-action="navigate" data-page="catalog">Practice locally</button></div></section>`;
  if (state.roomError) return `<section class="room-error"><div class="error-badge">!</div><div class="eyebrow">ROOM LINK</div><h1>We couldn’t join this room.</h1><p>${esc(state.roomError)}</p><div class="room-error-actions"><button class="button button-primary" data-action="retry-room">Try again ${icon('arrow')}</button><button class="button button-outline" data-action="navigate" data-page="catalog">Back to games</button></div></section>`;
  if (!state.room) return `<section class="room-loading"><span class="loader"></span><div class="eyebrow">CONNECTING TO YOUR ROOM</div><h1>Finding the arcade…</h1><p>Joining as a guest. You can choose an account later.</p></section>`;
  const game = getGame(state.room.gameId);
  if (!game) return `<section class="room-error"><h1>Unknown game room.</h1><button class="button button-primary" data-action="navigate" data-page="catalog">Back to game shelf</button></section>`;
  if (state.room.status === 'waiting') return renderLobby(game, state.room);
  return renderGameScreen();
}

export function renderLobby(game, room) {
  const players = currentPlayers();
  const isHost = state.user?.uid === room.hostUid;
  return `<div class="lobby-topline"><button class="text-button" data-action="navigate" data-page="catalog">${icon('exit')} Leave room</button><span class="room-code">ROOM <b>${esc(room.id.slice(0, 7).toUpperCase())}</b></span><span class="private-tag"><i></i> PRIVATE ROOM</span></div>
    <section class="lobby-hero"><div class="lobby-art art-${game.accent}"><img class="lobby-art-image" src="${getGameArtwork(game).src}" alt="" aria-hidden="true" loading="lazy" style="object-position:${getGameArtwork(game).focal}" onerror="this.classList.add('is-failed')"><div class="art-shade"></div><div class="art-scanlines"></div><div class="art-sigil">${esc(game.icon)}</div><div class="lobby-art-label">${esc(getGameArtwork(game).engineLabel)}<br><b>TOGETHER</b></div></div><div class="lobby-copy"><div class="eyebrow">YOU’RE IN THE RIGHT PLACE</div><h1>${esc(game.title)}<span>.</span></h1><p>${esc(game.blurb)} Invite one or two people and the game is on.</p><div class="lobby-badges"><span>${icon('people')} 2–${room.maxPlayers} players</span><span>${icon('link')} Invite-only</span><span>${icon('gamepad')} Browser game</span></div><div class="lobby-actions"><button class="button button-primary" data-action="copy-room-link">${icon('copy')} Copy invite link</button><button class="button button-outline" data-action="share-room-link">${icon('link')} Share</button>${isHost ? `<button class="button button-glow" data-action="start-room" ${players.length < 2 ? 'disabled' : ''}>Start match ${icon('arrow')}</button>` : `<span class="host-wait">Waiting for <b>${esc(room.hostName || 'the host')}</b> to start…</span>`}</div><small class="lobby-hint">${players.length < 2 ? 'Share the link with at least one friend to unlock Start match.' : `All set. ${isHost ? 'Start when your crew is ready.' : 'The host can start the match now.'}`}</small></div></section>
    <section class="lobby-players"><div class="panel-heading"><div><span class="eyebrow">THE LOBBY</span><h2>Players ready <i>${players.length} / ${room.maxPlayers}</i></h2></div><span class="lobby-live"><i></i> LINK SHARING ON</span></div><div class="player-slot-grid">${Array.from({ length: room.maxPlayers }, (_, index) => players[index] ? `<article class="player-slot is-filled"><span class="slot-avatar slot-${index}">${esc(players[index].name.slice(0, 1).toUpperCase())}</span><span class="slot-label">PLAYER ${index + 1}</span><b>${esc(players[index].name)}${players[index].uid === room.hostUid ? `<i class="host-chip">HOST</i>` : ''}</b><small><i></i> IN THE ROOM</small></article>` : `<article class="player-slot is-empty"><span class="slot-avatar">+</span><span class="slot-label">PLAYER ${index + 1}</span><b>Waiting for a friend</b><small>Share your invite link</small></article>`).join('')}</div></section>
    <section class="lobby-bottom"><div><b>Playing from different places?</b><span>That’s the point. Your moves sync to everyone in the room.</span></div><button class="text-button" data-action="copy-room-link">Copy link again ${icon('arrow')}</button></section>`;
}

export function renderHowToPlay(game) {
  const guide = getGameGuide(game);
  if (!guide) return '';
  return `<details class="how-to-play" open><summary><span class="how-to-icon">?</span><span><b>How to play</b><small>${esc(guide.mode)}</small></span><i>⌄</i></summary><div class="how-to-content"><div><span class="eyebrow">GOAL</span><p>${esc(guide.goal)}</p></div><div><span class="eyebrow">CONTROLS</span><p>${esc(guide.controls)}</p></div><div><span class="eyebrow">RULES</span><p>${esc(guide.rules)}</p></div><kbd>${esc(guide.shortcut)}</kbd></div></details>`;
}

export function renderGameScreen() {
  const game = currentGame();
  const gameState = currentGameState();
  const players = currentPlayers();
  if (!game || !gameState) return `<section class="room-loading"><span class="loader"></span><div class="eyebrow">LOADING GAME</div><h1>Setting up the cabinet…</h1></section>`;
  const me = currentUid();
  const isTurn = !gameState.turnUid || gameState.turnUid === me;
  const statusText = gameState.phase === 'finished'
    ? gameState.winnerUid ? `${activeName(gameState.winnerUid, players)} takes the round` : 'That’s a draw'
    : isTurn ? 'Your move' : `${activeName(gameState.turnUid, players)} is up`;
  return `<div class="play-topline"><button class="text-button" data-action="leave-session">${icon('exit')} Leave game</button><div class="playing-label"><span class="playing-pulse"></span>${state.local ? 'LOCAL PRACTICE' : 'LIVE ROOM'} <i>·</i> ${esc(game.category.toUpperCase())}</div><span class="room-code">${state.local ? 'PRACTICE' : `ROOM ${esc((state.room?.id || '').slice(0, 7).toUpperCase())}`}</span></div>
    <div class="play-layout"><section class="game-stage surface"><div class="game-stage-heading"><div class="game-stage-title"><span class="game-mini-icon art-${game.accent}">${esc(game.icon)}</span><div><div class="eyebrow">${esc(game.category.toUpperCase())} · ROUND ${gameState.round || gameState.questionIndex + 1 || 1}</div><h1>${esc(game.title)}</h1></div></div><div class="turn-chip ${gameState.phase === 'finished' ? 'is-finished' : ''}"><span></span>${esc(statusText)}</div></div>
      ${renderHowToPlay(game)}
      ${gameState.phase === 'finished' ? `<div class="result-banner ${gameState.winnerUid === me ? 'is-win' : ''}"><span class="result-mark">${gameState.winnerUid === me ? '✦' : gameState.winnerUid ? '◉' : '＝'}</span><div><b>${gameState.winnerUid ? (gameState.winnerUid === me ? 'Nice one — you win!' : `${esc(activeName(gameState.winnerUid, players))} wins this one.`) : 'A perfectly even match.'}</b><small>${gameState.result === 'draw' ? 'Run it back and settle the score.' : 'Well played. Fancy another round?'}</small></div><button class="button button-outline button-small" data-action="play-again">Play again ${icon('arrow')}</button></div>` : ''}
      ${renderEngineBoard(game, gameState, players, me)}
      <div class="game-stage-footer"><span>${icon('spark')} ${esc(game.blurb)}</span><span>Moves sync automatically ${state.local ? 'on this device' : 'for every player'}</span></div>
    </section><aside class="match-rail surface"><div class="match-rail-heading"><div><span class="eyebrow">MATCH ROOM</span><h2>The players</h2></div><span class="live-tag is-${state.local ? 'local' : state.online ? 'live' : 'offline'}"><i></i> ${state.local ? 'LOCAL' : state.online ? 'LIVE' : 'OFFLINE'}</span></div><div class="match-player-list">${players.map((player, index) => `<div class="match-player ${player.uid === me ? 'is-me' : ''} ${gameState.turnUid === player.uid ? 'is-turn' : ''}"><span class="match-player-avatar player-avatar-${index}">${player.uid === 'local-cpu' ? 'CPU' : esc(player.name.slice(0, 1).toUpperCase())}</span><span class="match-player-copy"><b>${esc(player.name)} ${player.uid === me ? '<i>YOU</i>' : ''}</b><small>${gameState.turnUid === player.uid && gameState.phase !== 'finished' ? 'Playing now' : player.uid === state.room?.hostUid ? 'Room host' : 'In the match'}</small></span>${gameState.scores ? `<strong>${gameState.scores[player.uid] || 0}<small>PTS</small></strong>` : gameState.turnUid === player.uid ? `<span class="player-turn-dot"></span>` : ''}</div>`).join('')}</div>
      ${state.local ? `<div class="rail-note"><span>${icon('spark')}</span><div><b>Just you and the browser.</b><small>Want a real rival? Create a room and send a link.</small></div></div><button class="button button-primary rail-main-button" data-action="quick-room">Invite a friend ${icon('arrow')}</button>` : `<div class="room-share-card"><span class="eyebrow">BRING IN ANOTHER PLAYER</span><p>Send the room link. They can join as a guest.</p><div class="room-share-actions"><button class="button button-outline" data-action="copy-room-link">${icon('copy')} Copy room link</button><button class="button button-quiet" data-action="share-room-link">${icon('link')} Share</button></div></div>`}
      <button class="text-button rail-back" data-action="navigate" data-page="catalog">Back to game shelf ${icon('arrow')}</button></aside></div>`;
}
