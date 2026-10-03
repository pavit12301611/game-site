import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { markGraphic, memoryGraphic, handGraphic } from '../src/ui/game-pieces.js';
import { MEMORY_ICONS } from '../src/engines/memory.js';
import { ROOM_GAMES, getGameArtwork } from '../src/catalog.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
function fragment(html) { return JSDOM.fragment(html); }

test('all three player marks have scalable art and unchanged text equivalents', () => {
  for (const [i, mark] of ['✕', '◯', '◇'].entries()) {
    const content = fragment(markGraphic(i));
    assert.equal(content.textContent, mark);
    assert.equal(content.querySelector('svg').getAttribute('aria-hidden'), 'true');
    assert.equal(content.querySelector('svg').getAttribute('viewBox'), '0 0 80 80');
  }
});
test('every memory face gets distinct vector art without changing its rule identity', () => {
  assert.equal(new Set(MEMORY_ICONS.map(memoryGraphic)).size, MEMORY_ICONS.length);
  for (const symbol of MEMORY_ICONS) {
    const content = fragment(memoryGraphic(symbol));
    assert.equal(content.textContent, symbol);
    assert.equal(content.querySelectorAll('svg').length, 1);
    assert.equal(content.querySelector('svg').getAttribute('aria-hidden'), 'true');
  }
  assert.equal(fragment(memoryGraphic('<script>')).querySelector('script'), null);
});
test('rock paper scissors each use distinct locally-rendered hand art', () => {
  const art = ['rock', 'paper', 'scissors'].map(value => handGraphic(value, ''));
  assert.equal(new Set(art).size, 3);
  for (const svg of art) assert.equal(fragment(svg).querySelectorAll('svg').length, 1);
  assert.equal(fragment(handGraphic('heads', 'Heads')).textContent, 'Heads');
});
test('all ten social game covers have unique art, subjects and documented generated provenance', () => {
  const hashes = new Set();
  const credits = readFileSync('public/images/CREDITS.md', 'utf8');
  for (const game of ROOM_GAMES) {
    const art = getGameArtwork(game);
    hashes.add(createHash('sha256').update(readFileSync(`public${art.src}`)).digest('hex'));
    const rows = credits.split('\n').filter(row => row.startsWith(`| games/${game.id}.webp |`));
    assert.equal(rows.length, 1); assert.match(rows[0], /AI-generated cover illustration \(not gameplay screenshot\)/);
    assert.ok(art.alt.length > 20);
  }
  assert.equal(hashes.size, 10);
});
