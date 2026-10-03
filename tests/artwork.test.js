/**
 * The artwork contract: every game has a picture of its own, the files are small and credited, and the
 * markup that shows them cannot cause layout shift. Rendered markup (landing/catalog) is checked in
 * tests/app-render.test.js; this file checks the catalog data and the files on disk.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CATEGORIES, CATEGORY_ARTWORK, GAME_ARTWORK, GAMES, HERO_ARTWORK, getGameArtwork } from '../src/catalog.js';
import { artImage } from '../src/ui/html.js';

const publicDir = new URL('../public/', import.meta.url).pathname;
const imagesDir = join(publicDir, 'images');
const FULL_MAX = 150 * 1024;
const SMALL_MAX = 40 * 1024;

const onDisk = (src) => join(publicDir, src.replace(/^\//, ''));
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

function listImages(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return listImages(join(dir, entry.name), `${prefix}${entry.name}/`);
    return /\.(webp|jpe?g|png|svg)$/i.test(entry.name) ? [`${prefix}${entry.name}`] : [];
  });
}

test('every game has its own picture: a distinct file, a 640 px variant, a subject text and a credit', () => {
  assert.equal(GAMES.length, 160);
  const hashes = new Set();
  for (const game of GAMES) {
    if (game.options.variant) {
      const art = getGameArtwork(game);
      assert.equal(art.src, `/images/expansion/${game.id}.svg`);
      assert.ok(art.alt && art.credit);
      assert.deepEqual([art.width, art.height], [640, 400]);
      assert.ok(existsSync(onDisk(art.src)));
      hashes.add(sha(onDisk(art.src)));
      continue;
    }
    assert.ok(Object.hasOwn(GAME_ARTWORK, game.id), `${game.id} has an entry in GAME_ARTWORK`);
    const art = getGameArtwork(game);
    assert.equal(art.src, `/images/games/${game.id}.webp`, `${game.id} uses its own file`);
    assert.equal(art.srcset, `/images/games/${game.id}-640.webp 640w, /images/games/${game.id}.webp 1280w`);
    assert.ok(art.alt && art.alt.length > 10, `${game.id} has descriptive alt text`);
    assert.ok(art.credit && /generated/i.test(art.credit), `${game.id} is labelled as generated`);
    assert.deepEqual([art.width, art.height], [1280, 800]);
    for (const file of [art.src, `/images/games/${game.id}-640.webp`]) {
      assert.ok(existsSync(onDisk(file)), `${file} exists`);
      hashes.add(sha(onDisk(file)));
    }
  }
  assert.equal(hashes.size, 200, 'no two games (or sizes) share the same picture');
  assert.equal(new Set(GAMES.map((game) => getGameArtwork(game).alt)).size, 160, 'no two games share a description');
});

test('picture files stay within the weight budget (150 KB full size, 40 KB small) and the catalog within 2 MB', () => {
  let catalogBytes = 0;
  for (const game of GAMES) {
    if (game.options.variant) { catalogBytes += statSync(onDisk(getGameArtwork(game).src)).size; continue; }
    const full = statSync(onDisk(`/images/games/${game.id}.webp`)).size;
    const small = statSync(onDisk(`/images/games/${game.id}-640.webp`)).size;
    assert.ok(full <= FULL_MAX, `${game.id}.webp is ${full} B`);
    assert.ok(small <= SMALL_MAX, `${game.id}-640.webp is ${small} B`);
    catalogBytes += small; // a catalog card downloads the 640 px variant on a phone
  }
  assert.ok(catalogBytes <= 2 * 1024 * 1024, `the 160 catalog cards weigh ${catalogBytes} B at 640 px`);
  for (const file of listImages(imagesDir)) {
    assert.ok(statSync(join(imagesDir, file)).size <= FULL_MAX, `${file} is at most 150 KB`);
  }
});

test('the hero and the four category covers exist, with sizes that match the markup', () => {
  assert.deepEqual([HERO_ARTWORK.width, HERO_ARTWORK.height], [1600, 900]);
  assert.ok(existsSync(onDisk(HERO_ARTWORK.src)) && existsSync(onDisk('/images/hero-800.webp')));
  assert.deepEqual(Object.keys(CATEGORY_ARTWORK), CATEGORIES.filter((name) => !['All games', '3D arenas', '2D classics'].includes(name)));
  for (const [name, art] of Object.entries(CATEGORY_ARTWORK)) {
    assert.ok(existsSync(onDisk(art.src)), `${name} cover exists`);
    assert.ok(existsSync(onDisk(`/images/categories/${name.toLowerCase()}-640.webp`)), `${name} small cover exists`);
  }
  const hashes = new Set([HERO_ARTWORK.src, ...Object.values(CATEGORY_ARTWORK).map((art) => art.src)].map((src) => sha(onDisk(src))));
  assert.equal(hashes.size, 5, 'the hero and the covers are all different pictures');
  for (const file of ['og-image.jpg']) assert.ok(existsSync(join(imagesDir, file)), `${file} exists`);
  for (const file of ['favicon.svg', 'favicon-48.png', 'apple-touch-icon.png']) assert.ok(existsSync(join(publicDir, file)), `${file} exists`);
});

test('public/images/CREDITS.md has a line for every image file, and no line for a missing file', () => {
  const credits = readFileSync(join(imagesDir, 'CREDITS.md'), 'utf8');
  const rows = credits.split('\n').filter((line) => /^\| (?!File |---)/.test(line));
  const credited = rows.map((line) => line.split('|')[1].trim());
  for (const file of listImages(imagesDir)) {
    assert.ok(credited.includes(file), `${file} is listed in CREDITS.md`);
  }
  for (const row of rows) {
    const [file, subject, source, licence, author] = row.split('|').slice(1, 6).map((cell) => cell.trim());
    assert.ok(subject && source && licence && author, `${file} has subject, source, licence and author`);
    if (!file.startsWith('../')) assert.ok(existsSync(join(imagesDir, file)), `${file} is credited but missing`);
    assert.match(source, /generated|pexels|pixabay|unsplash|cc0/i, `${file} names an allowed source`);
  }
});

test('artImage always writes width, height and alt; only the hero is eager with fetchpriority=high', () => {
  const card = artImage(getGameArtwork('connect-four'), { className: 'game-art-image' });
  assert.match(card, /width="1280" height="800"/);
  assert.match(card, / alt="[^"]+"/);
  assert.match(card, /loading="lazy"/);
  assert.match(card, /decoding="async"/);
  assert.match(card, /srcset="[^"]+" sizes="100vw"/);
  assert.doesNotMatch(card, /fetchpriority/);

  const hero = artImage(HERO_ARTWORK, { className: 'hero-artwork', hero: true });
  assert.match(hero, /fetchpriority="high"/);
  assert.match(hero, /width="1600" height="900"/);
  assert.doesNotMatch(hero, /loading="lazy"/);
});

test('index.html carries the social tags and the icon links', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const needle of ['property="og:title"', 'property="og:image"', 'name="twitter:card" content="summary_large_image"', 'rel="apple-touch-icon"', 'href="/favicon.svg"']) {
    assert.ok(html.includes(needle), `index.html contains ${needle}`);
  }
  assert.match(html, /og:image:width" content="1200"/);
  assert.match(html, /og:image:height" content="630"/);
});

test('the external hero preload matches the image the landing page draws', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const preload = readFileSync(new URL('../public/theme-preload.js', import.meta.url), 'utf8');
  assert.match(html, /<script src="\/theme-preload\.js"><\/script>/, 'the pre-paint script is an external file');
  assert.ok(preload.includes(`hero.href = '${HERO_ARTWORK.src}'`), 'the preload fetches the same file');
  assert.ok(preload.includes(`'${HERO_ARTWORK.srcset}'`), 'with the same srcset');
  assert.ok(preload.includes("setAttribute('imagesizes', '100vw')"), 'and the same sizes as artImage() uses for the hero');
  assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i, 'index.html has no inline script body');
});

test('social image URLs are absolute on the production domain', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /property="og:image" content="https:\/\/psd-gaming\.vercel\.app\/images\/og-image\.jpg"/);
  assert.match(html, /name="twitter:image" content="https:\/\/psd-gaming\.vercel\.app\/images\/og-image\.jpg"/);
  assert.match(html, /property="og:url" content="https:\/\/psd-gaming\.vercel\.app\/"/);
  assert.match(html, /rel="canonical" href="https:\/\/psd-gaming\.vercel\.app\/"/);
});
