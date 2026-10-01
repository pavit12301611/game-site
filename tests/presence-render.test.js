/**
 * What presence looks like in the lobby and in the match rail.
 *
 * The views are pure ("state in, HTML out"), so this sets `state.room`, `state.user` and
 * `state.presence` by hand and renders the two screens that show who is still in the room. No
 * Firebase: the heartbeat documents are faked exactly as src/online/presence.js stores them.
 */
import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

let state;
let renderLobby;
let renderGameScreen;
let renderHostWait;
let getGame;
let AWAY_AFTER_MS;

const ALICE = 'uid-alice';
const BOB = 'uid-bob';

before(async () => {
  const dom = new JSDOM('<!doctype html><html><head><meta id="meta-theme-color" content=""></head><body><div id="app"></div></body></html>', {
    url: 'https://psd-gaming.test/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const define = (name, value) => Object.defineProperty(global, name, { value, configurable: true, writable: true });
  define('window', window);
  define('document', window.document);
  define('navigator', window.navigator);
  define('localStorage', window.localStorage);
  define('location', window.location);
  ({ state } = await import('../src/state.js'));
  ({ renderLobby, renderGameScreen, renderHostWait } = await import('../src/views/pages.js'));
  ({ getGame } = await import('../src/catalog.js'));
  ({ AWAY_AFTER_MS } = await import('../src/presence-status.js'));
});

/** Parses a rendered fragment so the assertions can use selectors. */
function parse(html) {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

function room(status = 'waiting') {
  return {
    id: 'room-presence-1',
    hostUid: ALICE,
    hostName: 'Alice',
    gameId: 'pixel-tac-toe',
    playerUids: [ALICE, BOB],
    playerNames: { [ALICE]: 'Alice', [BOB]: 'Bob' },
    maxPlayers: 2,
    status,
    state: { phase: 'playing', turnUid: ALICE, winnerUid: null, result: null, moves: 0, board: Array(9).fill(null), size: 3 },
  };
}

beforeEach(() => {
  state.local = null;
  state.user = { uid: BOB, isAnonymous: true };
  state.room = room();
  state.presence = {};
  state.presenceClockOffsetMs = 0;
});

test('with no heartbeat documents the lobby reads exactly as it did before presence', () => {
  const lobby = parse(renderLobby(getGame('pixel-tac-toe'), state.room));
  const slots = [...lobby.querySelectorAll('.player-slot.is-filled > small')];
  assert.equal(slots.length, 2);
  for (const slot of slots) {
    assert.match(slot.textContent, /IN THE ROOM/);
    assert.ok(slot.classList.contains('is-unknown'));
  }
  assert.doesNotMatch(lobby.querySelector('.host-wait').textContent, /away|left/i);
});

test('the lobby shows who is here, who is away and for how long, and who left', () => {
  const now = Date.now();
  state.presence = {
    [ALICE]: { lastSeenMs: now - AWAY_AFTER_MS - 2 * 60_000, status: 'here' },
    [BOB]: { lastSeenMs: now - 3_000, status: 'here' },
  };
  const lobby = parse(renderLobby(getGame('pixel-tac-toe'), state.room));
  const [aliceSlot, bobSlot] = [...lobby.querySelectorAll('.player-slot.is-filled')];
  assert.match(aliceSlot.querySelector('small').textContent, /AWAY · 3 MIN/);
  assert.ok(aliceSlot.querySelector('small').classList.contains('is-away'));
  assert.match(bobSlot.querySelector('small').textContent, /IN THE ROOM/);
  assert.ok(bobSlot.querySelector('small').classList.contains('is-here'));

  state.presence[ALICE] = { lastSeenMs: now - 1_000, status: 'left' };
  const after = parse(renderLobby(getGame('pixel-tac-toe'), state.room));
  assert.match(after.querySelector('.player-slot.is-filled small').textContent, /LEFT THE ROOM/);
});

test('a guest waiting for an absent host is told so, and told what they can do', () => {
  const now = Date.now();
  const away = renderHostWait(state.room, { [ALICE]: { kind: 'away', label: 'AWAY · 5 MIN', detail: 'Away for 5 min', awayForMs: 5 * 60_000 } });
  assert.match(away, /Waiting for <b>Alice<\/b> to start/);
  assert.match(away, /Alice has been away for 5 min\. You can wait, or leave the room\./);
  assert.match(away, /class="host-wait is-away"/);

  const left = renderHostWait(state.room, { [ALICE]: { kind: 'left', label: 'LEFT THE ROOM', detail: 'Left the room', awayForMs: null } });
  assert.match(left, /Alice left the room\. You can wait for them to come back, or leave\./);

  const here = renderHostWait(state.room, { [ALICE]: { kind: 'here', label: 'IN THE ROOM', detail: '', awayForMs: null } });
  assert.doesNotMatch(here, /<em>/, 'nothing to add while the host is here');
  assert.ok(now > 0);
});

test('the host name in the wait line is escaped like every other player string', () => {
  const html = renderHostWait({ ...state.room, hostName: '<img src=x onerror=alert(1)>' }, {});
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test('the match rail dims an away player and says why, and the turn chip says who is being waited for', () => {
  state.room = room('playing');
  const now = Date.now();
  state.presence = {
    [ALICE]: { lastSeenMs: now - AWAY_AFTER_MS - 60_000, status: 'here' },
    [BOB]: { lastSeenMs: now - 2_000, status: 'here' },
  };
  const screen = parse(renderGameScreen());
  const players = [...screen.querySelectorAll('.match-player')];
  assert.equal(players.length, 2);
  const alice = players.find((node) => /Alice/.test(node.textContent));
  const bob = players.find((node) => /Bob/.test(node.textContent));
  assert.ok(alice.classList.contains('is-away'));
  assert.match(alice.querySelector('small').textContent, /Away for 2 min/);
  assert.ok(bob.classList.contains('is-here'));
  assert.match(bob.querySelector('small').textContent, /In the match/, 'a present player keeps the usual line');
  assert.match(screen.querySelector('.turn-chip').textContent, /Alice is up · away 2 min/);

  state.presence[ALICE] = { lastSeenMs: now, status: 'left' };
  const afterLeft = parse(renderGameScreen());
  assert.match(afterLeft.querySelector('.turn-chip').textContent, /Alice is up · left the room/);
  assert.match([...afterLeft.querySelectorAll('.match-player')].find((node) => /Alice/.test(node.textContent)).querySelector('small').textContent, /Left the room/);
});

test('presence never shows up in local practice', () => {
  state.local = {
    gameId: 'pixel-tac-toe',
    players: [{ uid: 'local-you', name: 'You' }, { uid: 'local-cpu', name: 'CPU' }],
    gameState: { phase: 'playing', turnUid: 'local-you', winnerUid: null, result: null, moves: 0, board: Array(9).fill(null), size: 3 },
    seed: 'seed',
  };
  state.presence = { 'local-cpu': { lastSeenMs: 0, status: 'left' } };
  const screen = parse(renderGameScreen());
  assert.equal(screen.querySelector('.match-player.is-left'), null);
  assert.doesNotMatch(screen.textContent, /Left the room|Away for/);
});

test('the server-clock offset is applied: a laptop 90 s behind the server still sees everyone here', () => {
  const now = Date.now();
  // The server stamped the heartbeats 90 s "in the future" from this machine's point of view.
  state.presenceClockOffsetMs = 90_000;
  state.presence = {
    [ALICE]: { lastSeenMs: now + 85_000, status: 'here' },
    [BOB]: { lastSeenMs: now + 88_000, status: 'here' },
  };
  const lobby = parse(renderLobby(getGame('pixel-tac-toe'), state.room));
  for (const slot of lobby.querySelectorAll('.player-slot.is-filled > small')) {
    assert.ok(slot.classList.contains('is-here'), slot.outerHTML);
  }
});
