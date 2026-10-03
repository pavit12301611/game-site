import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { LIBRARY, ROOM_GAMES, GAMES, getGameArtwork } from '../src/catalog.js';
import { SOLO_GAMES } from '../src/arcade/catalog.js';

test('public library has eighteen different rule engines, not numbered variants', () => {
  assert.equal(LIBRARY.length, 22); assert.equal(ROOM_GAMES.length, 10); assert.equal(SOLO_GAMES.length, 12);
  assert.equal(new Set(LIBRARY.map(g => g.engine)).size, 22);
  assert.equal(new Set(LIBRARY.map(g => g.id)).size, 22);
  assert.ok(LIBRARY.every(g => !g.options.variant && !/ (?:0[1-9]|10)$/.test(g.title)));
  assert.equal(GAMES.length, 40, 'legacy room IDs remain available without being counted as public games');
  assert.equal(LIBRARY.filter(g => g.options.dimension === '3D').length, 1);
});
test('every public game has unique real artwork and every standalone game has a valid route', () => {
  assert.equal(new Set(LIBRARY.map(g => getGameArtwork(g).src)).size, 22);
  for (const game of LIBRARY) {
    const art = getGameArtwork(game);
    assert.ok(existsSync(`public${art.src}`), art.src);
    assert.ok(art.width && art.height && art.credit);
  }
  for (const game of SOLO_GAMES) {
    assert.ok(existsSync(game.options.launch.split('?')[0].slice(1)));
    assert.ok(statSync(`public/images/originals/${game.id}.webp`).size < 100000);
    assert.match(getGameArtwork(game).credit, /not a gameplay screenshot/);
  }
});
test('room picker and quick play use the curated room set rather than retired aliases', () => {
  for (const path of ['src/app.js', 'src/views/modals.js']) assert.match(readFileSync(path, 'utf8'), /ROOM_GAMES as GAMES/);
});
