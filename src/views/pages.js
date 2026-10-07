/**
 * Page content renderers: home, catalog, friends, reviews, admin, privacy, safety, room, game.
 */

import { state, currentGame, currentPlayers, currentGameState, currentPresence } from '../state.js';
import { GAMES, CATEGORIES, getGame, HERO_ARTWORK, CATEGORY_ARTWORK, GAME_ARTWORK, getGameArtwork, getGameGuide, ENGINE_LABELS } from '../catalog.js';
import { connection, onlineUnavailableNote } from '../connection.js';
import { esc, icon } from '../ui/html.js';
import { playerDisplayName } from '../ui/players.js';
import { presenceLabel } from '../views/modals.js';

/** Games filtered by the current search and filter state. */
export function filteredGames() {
  let games = [...GAMES];
  if (state.query) {
    const q = state.query.toLowerCase();
    games = games.filter(g =>
      g.title.toLowerCase().includes(q) ||
      g.category.toLowerCase().includes(q) ||
      g.engine.toLowerCase().includes(q) ||
      g.blurb.toLowerCase().includes(q)
    );
  }
  if (state.category && state.category !== 'All games') {
    games = games.filter(g => g.category === state.category);
  }
  const { duration, difficulty, input } = state.filters;
  if (duration && duration !== 'Any length') games = games.filter(g => g.duration === duration);
  if (difficulty && difficulty !== 'Any difficulty') games = games.filter(g => g.difficulty === difficulty);
  if (input && input !== 'Any input') games = games.filter(g => g.input === input);
  return games;
}

/** Renders the game grid. */
export function renderGameGrid(games, featuredCount = 0) {
  if (!games.length) {
    return '<div class="empty-state"><p>No games match your filters. Try a different search.</p></div>';
  }
  return `<div class="game-grid" id="catalog-grid">
    ${games.map((game, i) => {
      const art = getGameArtwork(game);
      const isFav = state.favorites.includes(game.id);
      return `
        <article class="game-card" data-action="open-game" data-game-id="${game.id}" tabindex="0" role="button" aria-label="${esc(game.title)}">
          <div class="card-image">
            <img src="${art.src}" srcset="${art.srcset}" width="${art.width}" height="${art.height}" alt="${esc(art.alt)}" loading="${i < 6 ? 'eager' : 'lazy'}" decoding="async" />
            <span class="engine-badge">${esc(art.engineLabel)}</span>
            <button class="fav-btn ${isFav ? 'is-fav' : ''}" data-action="toggle-favorite" data-game-id="${game.id}" aria-label="${isFav ? 'Remove from favorites' : 'Add to favorites'}" onclick="event.stopPropagation()">${isFav ? '★' : '☆'}</button>
          </div>
          <div class="card-body">
            <h3>${esc(game.title)}</h3>
            <p class="card-blurb">${esc(game.blurb)}</p>
            <div class="card-meta">
              <span class="meta-chip">${esc(game.duration)}</span>
              <span class="meta-chip">${esc(game.difficulty)}</span>
              <span class="meta-chip">${esc(game.input)}</span>
            </div>
          </div>
        </article>
      `;
    }).join('')}
  </div>`;
}

/** Renders the current page. */
export function renderPage() {
  switch (state.page) {
    case 'home': return renderHomePage();
    case 'catalog': return renderCatalogPage();
    case 'friends': return renderFriendsPage();
    case 'reviews': return renderReviewsPage();
    case 'admin': return renderAdminPage();
    case 'privacy': return renderPrivacyPage();
    case 'safety': return renderSafetyPage();
    case 'room': return renderRoomPage();
    case 'game': return renderGamePage();
    default: return renderHomePage();
  }
}

function renderHomePage() {
  const conn = connection();
  return `
    <section class="hero-section">
      <img class="hero-img" src="${HERO_ARTWORK.src}" srcset="${HERO_ARTWORK.srcset}" width="${HERO_ARTWORK.width}" height="${HERO_ARTWORK.height}" alt="" fetchpriority="high" />
      <div class="hero-content">
        <h1 data-page-heading>Play together, anywhere</h1>
        <p class="hero-sub">Forty bite-size retro games for 2–3 friends. Share a link and play in the browser.</p>
        ${!conn.onlineFeatures ? `<div class="setup-banner"><p>${esc(onlineUnavailableNote(conn))}</p><button class="btn btn-sm" data-action="show-setup">Setup guide</button></div>` : ''}
        <div class="hero-actions">
          <button class="btn btn-primary" data-action="quick-play">Quick Play</button>
          ${conn.onlineFeatures ? `<button class="btn btn-secondary" data-action="quick-room">Create Room</button>` : ''}
          <button class="btn btn-ghost" data-action="navigate" data-page="catalog">Browse Games</button>
        </div>
      </div>
    </section>
    <section class="section-recent">
      <h2>Recently Played</h2>
      ${state.recentGames.length ? renderGameGrid(state.recentGames.map(id => getGame(id)).filter(Boolean), 0) : '<p class="empty-hint">No recently played games yet.</p>'}
    </section>
    <section class="section-favorites">
      <h2>Favorites</h2>
      ${state.favorites.length ? renderGameGrid(state.favorites.map(id => getGame(id)).filter(Boolean), 0) : '<p class="empty-hint">Star a game to add it here.</p>'}
    </section>
  `;
}

function renderCatalogPage() {
  const games = filteredGames();
  return `
    <section class="catalog-page">
      <h1 data-page-heading>Game Library</h1>
      <div class="filter-bar">
        <div class="filter-chips">
          ${CATEGORIES.map(c => `<button class="chip ${state.category === c ? 'active' : ''}" data-action="filter-category" data-category="${esc(c)}">${esc(c)}</button>`).join('')}
        </div>
        <div class="filter-selects">
          <select data-filter="duration">
            <option>Any length</option>
            ${[...new Set(GAMES.map(g => g.duration))].map(d => `<option ${state.filters.duration === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
          </select>
          <select data-filter="difficulty">
            <option>Any difficulty</option>
            ${[...new Set(GAMES.map(g => g.difficulty))].map(d => `<option ${state.filters.difficulty === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
          </select>
          <select data-filter="input">
            <option>Any input</option>
            ${[...new Set(GAMES.map(g => g.input))].map(d => `<option ${state.filters.input === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
          </select>
          <button class="btn btn-sm" data-action="clear-filters">Clear</button>
        </div>
      </div>
      <p class="game-count"><b>${games.length}</b> games</p>
      ${renderGameGrid(games)}
    </section>
  `;
}

function renderFriendsPage() {
  if (!state.user) {
    return `<section class="friends-page"><h1 data-page-heading>Friends</h1><div class="empty-state"><p>Sign in to find and challenge friends.</p><button class="btn btn-primary" data-action="open-auth">Sign in</button></div></section>`;
  }
  return `
    <section class="friends-page">
      <h1 data-page-heading>Friends</h1>
      <form data-form="friend-search" class="friend-search">
        <input type="text" name="search" placeholder="Search by username…" autocomplete="off" value="${esc(state.friendSearchTerm)}" />
        <button type="submit" class="btn btn-primary">Search</button>
      </form>
      ${state.socialError ? `<p class="error-text">${esc(state.socialError)}</p>` : ''}
      ${state.friendResults.length ? `
        <div class="friend-results">
          ${state.friendResults.map(u => `
            <div class="friend-card">
              <span class="friend-name">@${esc(u.username)}</span>
              <button class="btn btn-sm" data-action="send-friend-request" data-name="${esc(u.username)}">Add Friend</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${state.friends.length ? `
        <h2>Your Friends</h2>
        <div class="friend-list">
          ${state.friends.map(f => `
            <div class="friend-card">
              <span class="friend-name">@${esc(f.displayName || f.username)}</span>
              <div class="friend-actions">
                <button class="btn btn-sm btn-primary" data-action="challenge-friend" data-uid="${esc(f.uid)}" data-name="${esc(f.displayName || f.username)}" data-friendship-id="${esc(f.friendshipId || '')}">Challenge</button>
                <button class="btn btn-sm btn-ghost" data-action="block-player" data-uid="${esc(f.uid)}" data-name="${esc(f.displayName || f.username)}">Block</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${state.requests.length ? `
        <h2>Friend Requests</h2>
        <div class="friend-list">
          ${state.requests.map(r => `
            <div class="friend-card">
              <span class="friend-name">@${esc(r.fromName || r.fromUid)}</span>
              <div class="friend-actions">
                <button class="btn btn-sm btn-primary" data-action="accept-friend" data-request-id="${esc(r.id)}">Accept</button>
                <button class="btn btn-sm btn-ghost" data-action="decline-friend" data-request-id="${esc(r.id)}">Decline</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${state.invites.length ? `
        <h2>Game Invites</h2>
        <div class="friend-list">
          ${state.invites.map(inv => `
            <div class="friend-card">
              <span>@${esc(inv.fromName || inv.fromUid)} invited you to play ${esc(inv.gameTitle || 'a game')}</span>
              <button class="btn btn-sm btn-primary" data-action="join-game-invite" data-invite-id="${esc(inv.id)}" data-room-id="${esc(inv.roomId)}">Join</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${!state.friends.length && !state.requests.length && !state.invites.length && !state.friendResults.length ? '<div class="empty-state"><p>Search for friends by username to get started.</p></div>' : ''}
    </section>
  `;
}

function renderReviewsPage() {
  return `
    <section class="reviews-page">
      <h1 data-page-heading>Player Reviews</h1>
      ${state.featuredReview ? `
        <div class="featured-review">
          <div class="review-stars">${'★'.repeat(state.featuredReview.rating || 5)}</div>
          <blockquote>${esc(state.featuredReview.message)}</blockquote>
          <cite>— ${esc(state.featuredReview.reviewerName || 'Anonymous')}</cite>
          ${state.featuredReview.reply ? `<div class="review-reply"><strong>${esc(state.featuredReview.reply.assistantName || 'Arcade Agent')}:</strong> ${esc(state.featuredReview.reply.message)}</div>` : ''}
        </div>
      ` : ''}
      <div class="reviews-list">
        ${state.reviews.map(r => `
          <article class="review-card">
            <div class="review-header">
              <span class="review-stars">${'★'.repeat(r.rating || 0)}</span>
              <span class="review-game">${esc(r.gameTitle || 'Arcade')}</span>
            </div>
            ${r.title ? `<h3>${esc(r.title)}</h3>` : ''}
            <p>${esc(r.message)}</p>
            <cite>— ${esc(r.reviewerName || 'Anonymous')}</cite>
            ${r.reply ? `<div class="review-reply"><strong>${esc(r.reply.assistantName || 'Agent')}:</strong> ${esc(r.reply.message)}</div>` : ''}
          </article>
        `).join('')}
      </div>
      ${state.reviewsLoading ? '<p class="loading-text">Loading reviews…</p>' : ''}
      ${state.reviewsHasMore && !state.reviewsLoading ? '<button class="btn btn-secondary" data-action="load-more-reviews">Load more</button>' : ''}
      ${state.reviewsError ? `<p class="error-text">${esc(state.reviewsError)}</p>` : ''}
      <h2>Write a Review</h2>
      <form data-form="review" class="review-form">
        <div class="star-rating">
          ${[1,2,3,4,5].map(n => `<label><input type="radio" name="rating" value="${n}" ${n === 5 ? 'checked' : ''} /> ${'★'.repeat(n)}</label>`).join('')}
        </div>
        <input type="hidden" name="gameId" value="arcade" />
        <input type="text" name="title" placeholder="Title (optional)" maxlength="100" />
        <input type="text" name="reviewerName" placeholder="Your name" maxlength="30" value="${esc(state.displayName)}" />
        <textarea name="message" placeholder="Share your experience…" maxlength="1000" rows="4" required></textarea>
        <button type="submit" class="btn btn-primary" ${state.reviewSubmitting ? 'disabled' : ''}>
          ${state.reviewSubmitting ? 'Submitting…' : 'Submit Review'}
        </button>
        ${state.reviewModelStatus ? `<p class="model-status">${esc(state.reviewModelStatus)}</p>` : ''}
      </form>
    </section>
  `;
}

function renderAdminPage() {
  if (!state.isAdmin) return '<section class="admin-page"><h1 data-page-heading>Admin</h1><p>You do not have admin access.</p></section>';
  const d = state.adminData;
  return `
    <section class="admin-page">
      <h1 data-page-heading>Admin Studio</h1>
      <div class="admin-tabs" role="tablist">
        ${['overview', 'rooms', 'players', 'social', 'reviews', 'access'].map(tab => `
          <button role="tab" data-action="admin-tab" data-tab="${tab}" class="tab ${state.adminTab === tab ? 'active' : ''}" aria-selected="${state.adminTab === tab}">${tab[0].toUpperCase() + tab.slice(1)}</button>
        `).join('')}
      </div>
      <button class="btn btn-sm" data-action="refresh-admin">Refresh</button>
      ${state.adminLoading ? '<p class="loading-text">Loading…</p>' : ''}
      <div class="admin-content">
        ${state.adminTab === 'overview' && d ? `<p><b>${d.rooms?.length || 0}</b> rooms · <b>${d.players?.length || 0}</b> players</p>` : ''}
        ${state.adminTab === 'rooms' && d ? renderAdminRooms(d.rooms || []) : ''}
        ${state.adminTab === 'players' && d ? renderAdminPlayers(d.players || []) : ''}
        ${state.adminTab === 'access' ? '<p>Admin access is managed through the Firebase console or by other admins.</p>' : ''}
      </div>
    </section>
  `;
}

function renderAdminRooms(rooms) {
  if (!rooms.length) return '<p>No rooms found.</p>';
  return rooms.map(r => `
    <div class="admin-row">
      <span><b>${esc(r.gameId || '?')}</b> · ${esc(r.status || '?')} · ${esc(r.playerUids?.length || 0)} players</span>
      <button class="btn btn-sm btn-danger" data-action="admin-delete-room" data-room-id="${esc(r.id)}" data-name="${esc(r.hostName || r.hostUid)}">Delete</button>
    </div>
  `).join('');
}

function renderAdminPlayers(players) {
  if (!players.length) return '<p>No players found.</p>';
  return players.map(p => `
    <div class="admin-row">
      <span>@${esc(p.username || '?')} · <code>${esc(p.id?.slice(0, 8))}…</code></span>
      <div class="admin-actions">
        <button class="btn btn-sm" data-action="admin-copy-uid" data-uid="${esc(p.id)}">Copy UID</button>
        <button class="btn btn-sm btn-danger" data-action="admin-remove-player" data-uid="${esc(p.id)}" data-name="${esc(p.username)}">Remove</button>
      </div>
    </div>
  `).join('');
}

function renderPrivacyPage() {
  return `
    <section class="legal-page">
      <h1 data-page-heading>Privacy Policy</h1>
      <p>PSD-gaming is a browser arcade. Here is what happens with your data:</p>
      <h2>What we store</h2>
      <ul>
        <li><b>Guest accounts:</b> a Firebase anonymous ID. No email, no name.</li>
        <li><b>Registered accounts:</b> email, chosen username, and your friend list.</li>
        <li><b>Game rooms:</b> room state, moves, and chat messages. Rooms expire after 1 hour.</li>
        <li><b>Reviews:</b> your review text, rating, and the agent's reply. Public.</li>
      </ul>
      <h2>What we do not do</h2>
      <ul>
        <li>No analytics, no cookies, no third-party tracking.</li>
        <li>No selling or sharing of personal data.</li>
      </ul>
      <h2>Deletion</h2>
      <p>You can delete your account from the account menu. This removes your profile, username, friendships, and all associated data.</p>
      <h2>On-device AI</h2>
      <p>The review sentiment model runs entirely in your browser. No text is sent to any external API for analysis.</p>
    </section>
  `;
}

function renderSafetyPage() {
  return `
    <section class="legal-page">
      <h1 data-page-heading>Terms & Safety</h1>
      <h2>Rules</h2>
      <ul>
        <li>Be respectful in chat and reviews.</li>
        <li>Do not exploit bugs; report them instead.</li>
        <li>Do not share room links publicly if you want a private game.</li>
      </ul>
      <h2>Limitations</h2>
      <ul>
        <li>This is a casual arcade, not a competitive platform. Collusion is possible but there are no prizes or rankings.</li>
        <li>Rooms expire after 1 hour and are automatically deleted.</li>
        <li>Reports are read by a human operator. There is no automatic moderation.</li>
      </ul>
    </section>
  `;
}

function renderRoomPage() {
  if (state.roomError) {
    return `
      <section class="room-page">
        <h1 data-page-heading>Game Room</h1>
        <div class="error-state">
          <p>${esc(state.roomError)}</p>
          <button class="btn btn-primary" data-action="retry-room">Try again</button>
          <button class="btn btn-ghost" data-action="navigate" data-page="catalog">Back to games</button>
        </div>
      </section>
    `;
  }

  if (!state.room) {
    return `<section class="room-page"><h1 data-page-heading>Game Room</h1><p class="loading-text">Joining room…</p></section>`;
  }

  const room = state.room;
  const game = getGame(room.gameId);
  const art = game ? getGameArtwork(game) : null;
  const isHost = room.hostUid === state.user?.uid;
  const status = room.status || 'waiting';
  const presence = currentPresence();

  return `
    <section class="room-page">
      <h1 data-page-heading>${esc(game?.title || 'Game Room')}</h1>
      ${art ? `<div class="room-banner"><img src="${art.src}" srcset="${art.srcset}" width="${art.width}" height="${art.height}" alt="" loading="lazy" /><span class="engine-badge">${esc(art.engineLabel)}</span></div>` : ''}
      <div class="room-info">
        <p>Room code: <code class="room-code">${esc(room.code || room.id?.slice(0, 7))}</code></p>
        <div class="room-actions">
          <button class="btn btn-sm" data-action="copy-room-link">Copy Link</button>
          <button class="btn btn-sm" data-action="share-room-link">Share</button>
        </div>
      </div>
      <div class="player-list">
        ${(room.playerUids || []).map((uid, i) => `
          <div class="player-row">
            <span class="player-color" style="--pc: var(--p${i + 1})">${playerDisplayName(uid, [])}</span>
            <span class="presence-badge ${presence[uid]?.status || 'here'}">${presenceLabel(presence[uid])}</span>
          </div>
        `).join('')}
      </div>
      ${status === 'waiting' ? `
        ${isHost ? `<button class="btn btn-primary" data-action="start-room">Start Match</button>` : '<p>Waiting for the host to start…</p>'}
        <button class="btn btn-ghost" data-action="claim-host">Claim Host</button>
        <button class="btn btn-ghost" data-action="leave-room">Leave Room</button>
      ` : ''}
    </section>
  `;
}

function renderGamePage() {
  const game = currentGame();
  const gs = currentGameState();
  const players = currentPlayers();

  if (!game || !gs) {
    return `<section class="game-page"><h1 data-page-heading>No game loaded</h1><button class="btn btn-primary" data-action="navigate" data-page="catalog">Browse Games</button></section>`;
  }

  const art = getGameArtwork(game);
  const guide = getGameGuide(game);
  const isLocal = !!state.local;

  return `
    <section class="game-page">
      <div class="game-header">
        <h1 data-page-heading>${esc(game.title)}</h1>
        <div class="game-meta">
          <span class="engine-badge">${esc(art.engineLabel)}</span>
          ${players.map((p, i) => `<span class="player-chip" style="--pc: var(--p${i + 1})">${esc(playerDisplayName(p.uid, players))}</span>`).join('')}
        </div>
      </div>
      <div class="game-stage">
        ${renderBoard(game, gs, players)}
      </div>
      ${gs.status === 'finished' ? `<div class="game-result-banner" data-announce-result>${gs.winner === 'draw' ? 'Draw!' : `${playerDisplayName(gs.winner, players)} wins!`}</div>` : `<div class="turn-indicator" data-announce-turn>${playerDisplayName(gs.turnIndex % players.length === 0 ? players[0]?.uid : players[gs.turnIndex % players.length]?.uid, players)}'s turn</div>`}
      <div class="game-guide">
        ${guide ? `<details><summary>How to play</summary><div class="guide-content"><p><b>${esc(guide.mode)}</b></p><p><b>Goal:</b> ${esc(guide.goal)}</p><p><b>Controls:</b> ${esc(guide.controls)}</p><p>${esc(guide.rules)}</p></div></details>` : ''}
      </div>
      <div class="game-actions">
        <button class="btn btn-secondary" data-action="play-again">Play Again</button>
        <button class="btn btn-ghost" data-action="leave-session">Leave</button>
        <button class="btn btn-ghost" data-action="open-report" data-room-id="${state.roomId || ''}">Report</button>
      </div>
    </section>
  `;
}

function renderBoard(game, gs, players) {
  const uid = state.local ? 'local-you' : state.user?.uid;

  switch (game.engine) {
    case 'line': return renderLineBoard(game, gs, uid, players);
    case 'drop': return renderDropBoard(game, gs, uid, players);
    case 'memory': return renderMemoryBoard(game, gs, uid, players);
    case 'race': return renderRaceBoard(game, gs, uid, players);
    case 'rps': return renderRpsBoard(game, gs, uid, players);
    case 'quiz': return renderQuizBoard(game, gs, uid, players);
    case 'maze': return renderMazeBoard(game, gs, uid, players);
    case 'battle': return renderBattleBoard(game, gs, uid, players);
    case 'rally': return renderRallyBoard(game, gs, uid, players);
    case 'code': return renderCodeBoard(game, gs, uid, players);
    default: return '<div class="board-placeholder"><p>Board loading…</p></div>';
  }
}

function playerIdx(uid, players) {
  return players.findIndex(p => p.uid === uid);
}

function isMyTurn(gs, uid, players) {
  return players[gs.turnIndex % players.length]?.uid === uid;
}

function renderLineBoard(game, gs, uid, players) {
  const { size } = game.options;
  return `<div class="board board-line" data-nav="grid" data-cols="${size}">
    ${gs.board.map((cell, i) => {
      const owner = cell ? playerIdx(cell, players) : -1;
      const shape = owner >= 0 ? players[owner]?.uid === 'local-cpu' ? '●' : '✕' : '';
      const canPlay = !cell && gs.status === 'playing' && isMyTurn(gs, uid, players);
      return `<button class="board-cell ${owner >= 0 ? `p${owner + 1}` : ''} ${gs.winLine?.includes(i) ? 'is-win' : ''} ${gs.lastMove === i ? 'is-last' : ''}" data-action="line-move" data-index="${i}" ${canPlay ? '' : 'disabled'}>${shape}</button>`;
    }).join('')}
  </div>`;
}

function renderDropBoard(game, gs, uid, players) {
  const { cols, rows } = game.options;
  let html = '<div class="board board-drop">';
  html += '<div class="drop-arrows">';
  for (let c = 0; c < cols; c++) {
    const canDrop = gs.status === 'playing' && isMyTurn(gs, uid, players) && gs.colHeights[c] < rows;
    html += `<button class="drop-arrow" data-action="drop-move" data-col="${c}" ${canDrop ? '' : 'disabled'}>↓</button>`;
  }
  html += '</div>';
  html += `<div class="drop-grid" data-nav="grid" data-cols="${cols}">`;
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = 0; c < cols; c++) {
      const idx = c * rows + r;
      const cell = gs.board[idx];
      const owner = cell ? playerIdx(cell, players) : -1;
      html += `<div class="board-cell ${owner >= 0 ? `p${owner + 1}` : ''} ${gs.winLine?.includes(idx) ? 'is-win' : ''}">${owner >= 0 ? (players[owner]?.uid === 'local-cpu' ? '●' : '●') : ''}</div>`;
    }
  }
  html += '</div></div>';
  return html;
}

function renderMemoryBoard(game, gs, uid, players) {
  return `<div class="board board-memory" data-nav="grid" data-cols="${Math.ceil(Math.sqrt(gs.cards.length))}">
    ${gs.cards.map((card, i) => {
      const visible = gs.revealed[i] || gs.matched[i];
      const symbol = visible ? (gs.matched[i] ? ['♠','♥','♦','♣','★','◆','●','◎','✦','□','△','▽','⬡','⬢','⬟','⬠'][card % 16] : '?') : '?';
      const isMatched = gs.matched[i];
      const canFlip = !visible && gs.status === 'playing' && isMyTurn(gs, uid, players) && gs.selected.length < 2;
      return `<button class="board-cell memory-card ${isMatched ? 'is-matched' : ''} ${gs.selected.includes(i) ? 'is-flipped' : ''}" data-action="memory-flip" data-index="${i}" ${canFlip ? '' : 'disabled'}>${symbol}</button>`;
    }).join('')}
  </div>
  <div class="scoreboard">${players.map(p => `<span>${esc(playerDisplayName(p.uid, players))}: ${gs.scores[p.uid] || 0}</span>`).join(' · ')}</div>`;
}

function renderRaceBoard(game, gs, uid, players) {
  const target = game.options.target;
  return `<div class="board board-race">
    ${players.map(p => {
      const score = gs.scores[p.uid] || 0;
      const pct = Math.min(100, (score / target) * 100);
      return `<div class="race-lane">
        <span class="race-name">${esc(playerDisplayName(p.uid, players))}</span>
        <div class="race-bar"><div class="race-fill" style="width: ${pct}%"></div></div>
        <span class="race-score">${score}/${target}</span>
      </div>`;
    }).join('')}
    ${gs.status === 'playing' ? `<button class="btn btn-primary race-tap" data-action="race-tap">BOOST!</button>` : ''}
  </div>`;
}

function renderRpsBoard(game, gs, uid, players) {
  const mode = game.options.mode;
  const choices = mode === 'coin' ? ['heads', 'tails'] : mode === 'dice' ? ['1','2','3','4','5','6'] : ['rock', 'paper', 'scissors'];
  const labels = mode === 'coin' ? ['Heads', 'Tails'] : mode === 'dice' ? ['1','2','3','4','5','6'] : ['✊ Rock', '✋ Paper', '✌ Scissors'];
  const hasPicked = gs.picks[uid] !== undefined;

  return `<div class="board board-rps">
    <p>Round ${gs.round} · First to ${game.options.target}</p>
    <div class="rps-choices">
      ${choices.map((c, i) => `<button class="btn ${gs.picks[uid] === c ? 'btn-primary' : 'btn-secondary'}" data-action="duel-choice" data-choice="${c}" ${hasPicked || gs.status !== 'playing' ? 'disabled' : ''}>${labels[i]}</button>`).join('')}
    </div>
    ${gs.roundResult ? `<div class="rps-result">${gs.roundResult.winners?.length ? `${gs.roundResult.winners.map(w => playerDisplayName(w, players)).join(', ')} win${gs.roundResult.winners.length > 1 ? '' : 's'} the round!` : 'Tie round!'}</div>` : ''}
    <div class="scoreboard">${players.map(p => `<span>${esc(playerDisplayName(p.uid, players))}: ${gs.scores[p.uid] || 0}</span>`).join(' · ')}</div>
  </div>`;
}

function renderQuizBoard(game, gs, uid, players) {
  const q = gs.questions[gs.currentRound];
  if (!q) return '<div class="board board-quiz"><p>Loading question…</p></div>';

  const hasAnswered = gs.answers[uid] !== undefined;
  const allAnswered = players.every(p => gs.answers[p.uid] !== undefined);

  return `<div class="board board-quiz">
    <p class="quiz-round">Question ${gs.currentRound + 1} of ${gs.questions.length}</p>
    <h2 class="quiz-question">${esc(q.question)}</h2>
    <div class="quiz-options">
      ${q.options.map((opt, i) => {
        const chosen = gs.answers[uid] === i;
        const correct = gs.roundRevealed && i === q.answer;
        const wrong = gs.roundRevealed && chosen && i !== q.answer;
        return `<button class="quiz-option ${chosen ? 'chosen' : ''} ${correct ? 'correct' : ''} ${wrong ? 'wrong' : ''}" data-action="quiz-answer" data-answer="${i}" ${hasAnswered || gs.roundRevealed ? 'disabled' : ''}>${'ABCD'[i]}. ${esc(opt)}</button>`;
      }).join('')}
    </div>
    ${gs.roundRevealed || (allAnswered && !gs.roundRevealed) ? `<button class="btn btn-primary" data-action="quiz-next">${gs.roundRevealed ? 'Next Question' : 'Reveal Answer'}</button>` : ''}
    <div class="scoreboard">${players.map(p => `<span>${esc(playerDisplayName(p.uid, players))}: ${gs.scores[p.uid] || 0}</span>`).join(' · ')}</div>
  </div>`;
}

function renderMazeBoard(game, gs, uid, players) {
  const { width, height, grid, positions, goalX, goalY } = gs;
  let html = `<div class="board board-maze" data-nav="grid" data-cols="${width}">`;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isWall = grid[y]?.[x] === 1;
      const isGoal = x === goalX && y === goalY;
      const playersHere = players.filter(p => positions[p.uid]?.x === x && positions[p.uid]?.y === y);
      const playerClass = playersHere.length ? `p${playerIdx(playersHere[0].uid, players) + 1}` : '';
      html += `<div class="board-cell maze-cell ${isWall ? 'is-wall' : 'is-floor'} ${isGoal ? 'is-goal' : ''} ${playerClass}">${isGoal ? '✦' : playersHere.length ? '●' : ''}</div>`;
    }
  }
  html += '</div>';
  html += '<div class="maze-controls">';
  if (gs.status === 'playing') {
    html += `
      <button class="btn maze-btn" data-action="maze-move" data-direction="up">↑</button>
      <div class="maze-row">
        <button class="btn maze-btn" data-action="maze-move" data-direction="left">←</button>
        <button class="btn maze-btn" data-action="maze-move" data-direction="down">↓</button>
        <button class="btn maze-btn" data-action="maze-move" data-direction="right">→</button>
      </div>
    `;
  }
  html += '</div>';
  html += `<div class="scoreboard">${players.map(p => `<span>${esc(playerDisplayName(p.uid, players))}: ${gs.steps[p.uid] || 0} steps</span>`).join(' · ')}</div>`;
  return html;
}

function renderBattleBoard(game, gs, uid, players) {
  const { board, grid: grids, shots } = gs;
  const myGrid = grids[uid];
  const myShots = shots[uid] || Array(board * board).fill(false);
  const isMyTurnNow = isMyTurn(gs, uid, players);
  const target = state.selectedBattleTarget || players.find(p => p.uid !== uid)?.uid || '';

  let html = '<div class="board board-battle">';
  html += '<div class="battle-section"><h3>Your Waters</h3>';
  html += `<div class="battle-grid" data-nav="grid" data-cols="${board}">`;
  for (let i = 0; i < board * board; i++) {
    const hasShip = myGrid?.ships?.includes(i);
    const isHit = myGrid?.hits?.[i];
    html += `<div class="board-cell battle-cell ${hasShip ? 'has-ship' : ''} ${isHit ? 'is-hit' : ''}">${isHit ? '✹' : hasShip ? '●' : ''}</div>`;
  }
  html += '</div></div>';

  html += `<div class="battle-section"><h3>Fire At: ${players.filter(p => p.uid !== uid).map(p => `
    <button class="btn btn-sm ${target === p.uid ? 'btn-primary' : ''}" data-action="battle-target" data-uid="${p.uid}">${esc(playerDisplayName(p.uid, players))}</button>
  `).join('')}</h3>`;
  html += `<div class="battle-grid" data-nav="grid" data-cols="${board}">`;
  for (let i = 0; i < board * board; i++) {
    const shot = myShots[i];
    const hit = shot && target && grids[target]?.ships?.includes(i);
    const canFire = !shot && isMyTurnNow && gs.status === 'playing' && target;
    html += `<button class="board-cell battle-cell ${shot ? (hit ? 'is-hit' : 'is-miss') : ''}" data-action="battle-fire" data-index="${i}" data-uid="${target}" ${canFire ? '' : 'disabled'}>${shot ? (hit ? '✹' : '·') : ''}</button>`;
  }
  html += '</div></div></div>';
  return html;
}

function renderRallyBoard(game, gs, uid, players) {
  const { lanes } = game.options;
  const isMyTurnNow = isMyTurn(gs, uid, players);
  return `<div class="board board-rally">
    <p>Rally count: ${gs.rallyCount}</p>
    <div class="rally-lanes">
      ${Array.from({ length: lanes }, (_, i) => `
        <button class="btn rally-lane" data-action="rally-hit" data-lane="${i}" ${isMyTurnNow && gs.status === 'playing' ? '' : 'disabled'}>Lane ${i + 1}</button>
      `).join('')}
    </div>
    <div class="scoreboard">${players.map(p => `<span>${esc(playerDisplayName(p.uid, players))}: ${gs.scores[p.uid] || 0}</span>`).join(' · ')}</div>
  </div>`;
}

function renderCodeBoard(game, gs, uid, players) {
  const isMyTurnNow = isMyTurn(gs, uid, players);
  return `<div class="board board-code">
    <p>Guesses: ${gs.guesses.length} / ${gs.maxGuesses * players.length}</p>
    <div class="code-guesses">
      ${gs.guesses.map(g => `
        <div class="code-guess ${g.exact === gs.digits ? 'is-correct' : ''}">
          <span class="guess-digits">${g.guess.map((d, i) => `<span class="digit">${d}</span>`).join('')}</span>
          <span class="guess-feedback">EXACT: ${g.exact} · NEAR: ${g.near}</span>
          <span class="guess-by">${esc(playerDisplayName(g.uid, players))}</span>
        </div>
      `).join('')}
    </div>
    ${gs.status === 'playing' && isMyTurnNow ? `
      <div class="code-input">
        ${Array.from({ length: gs.digits }, (_, i) => `
          <button class="digit-btn" data-action="code-digit" data-index="${i}">${state.codeDraft[i] ?? 0}</button>
        `).join('')}
        <button class="btn btn-primary" data-action="code-submit">Try code</button>
      </div>
    ` : ''}
    ${gs.status === 'finished' && gs.code ? `<p class="code-reveal">The code was: ${gs.code.join(' ')}</p>` : ''}
  </div>`;
}