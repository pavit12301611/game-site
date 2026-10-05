/**
 * The shelf filters.
 *
 * The point of these tests is honesty as much as behaviour: every option the toolbar offers must
 * match at least one real game, "Any …" must be a true no-op, and the three dimensions that are not
 * per-game facts (player count and mode) must not be filterable — the panel explains them instead.
 */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { GAMES } from '../shared/games.js';

let filteredGames;
let filtersActive;
let renderCatalog;
let FILTERS;
let DIFFICULTIES;
let INPUT_STYLES;
let state;

before(async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'https://psd-gaming.test/#/catalog', pretendToBeVisual: true });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const define = (name, value) => Object.defineProperty(global, name, { value, configurable: true, writable: true });
  define('window', window);
  define('document', window.document);
  define('navigator', window.navigator);
  define('localStorage', window.localStorage);
  define('location', window.location);
  define('matchMedia', window.matchMedia);
  define('requestAnimationFrame', window.requestAnimationFrame.bind(window));
  ({ filteredGames, filtersActive, renderCatalog, FILTERS, DIFFICULTIES, INPUT_STYLES } = await import('../src/views/pages.js'));
  ({ state } = await import('../src/state.js'));
  state.page = 'catalog';
});

/** Reset every filter between tests so one test cannot leak into the next. */
function reset(overrides = {}) {
  state.query = '';
  state.category = 'All games';
  state.filters = { duration: 'Any length', difficulty: 'Any difficulty', input: 'Any input', ...overrides };
}

test('with nothing selected the shelf shows all 40 games and says so', () => {
  reset();
  assert.equal(filteredGames().length, GAMES.length);
  assert.equal(filtersActive(), false);
  assert.match(renderCatalog(), /SHOWING <b>40<\/b> \/ 40/);
  assert.doesNotMatch(renderCatalog(), /Reset filters/);
});

test('every duration bucket matches at least one game and the buckets partition the shelf', () => {
  const seen = new Set();
  for (const { label } of FILTERS.duration) {
    reset({ duration: label });
    const found = filteredGames().map((game) => game.id);
    if (label !== 'Any length') assert.ok(found.length > 0, `${label} must match something`);
    for (const id of found) seen.add(id);
    if (label !== 'Any length') {
      const minutes = Number.parseInt(GAMES.find((game) => game.id === found[0]).duration, 10);
      if (label === 'Under 5 min') assert.ok(minutes < 5);
      if (label === '5–8 min') assert.ok(minutes >= 5 && minutes <= 8);
      if (label === '9 min and up') assert.ok(minutes >= 9);
    }
  }
  assert.equal(seen.size, GAMES.length, 'the buckets cover every game exactly once');
});

test('every difficulty and input option comes from the catalog and narrows the shelf', () => {
  const difficulties = new Set(GAMES.map((game) => game.difficulty));
  const inputs = new Set(GAMES.map((game) => game.input));
  assert.deepEqual(new Set(DIFFICULTIES), new Set(['Any difficulty', ...difficulties]));
  assert.deepEqual(new Set(INPUT_STYLES), new Set(['Any input', ...inputs]));
  for (const difficulty of difficulties) {
    reset({ difficulty });
    const found = filteredGames();
    assert.ok(found.length > 0, `difficulty ${difficulty} must match something`);
    assert.ok(found.every((game) => game.difficulty === difficulty));
    assert.equal(filtersActive(), true);
  }
  for (const input of inputs) {
    reset({ input });
    const found = filteredGames();
    assert.ok(found.length > 0, `input ${input} must match something`);
    assert.ok(found.every((game) => game.input === input));
  }
});

test('filters combine with the search box and the category pills', () => {
  reset({ difficulty: 'Easy' });
  state.category = 'Puzzle';
  const found = filteredGames();
  assert.ok(found.length > 0);
  assert.ok(found.every((game) => game.category === 'Puzzle' && game.difficulty === 'Easy'));
  state.query = found[0].title.slice(0, 6);
  assert.deepEqual(filteredGames().map((game) => game.id), [found[0].id]);
  reset();
});

test('the toolbar only offers real dimensions and explains the two that are room choices', () => {
  reset();
  const html = renderCatalog();
  assert.match(html, /data-filter="duration"/);
  assert.match(html, /data-filter="difficulty"/);
  assert.match(html, /data-filter="input"/);
  assert.doesNotMatch(html, /data-filter="players"/, 'player count is a room choice, not a per-game fact');
  assert.doesNotMatch(html, /data-filter="mode"/, 'every game has local practice and online rooms');
  assert.match(html, /Every game works with 2 or 3 players and in local practice/, 'the panel must say why those are missing');
  const filterOptions = [...html.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  const catalogValues = new Set([
    'Any length', 'Any difficulty', 'Any input',
    ...GAMES.map((game) => game.difficulty), ...GAMES.map((game) => game.input),
    ...FILTERS.duration.map((entry) => entry.label),
  ]);
  for (const option of filterOptions) assert.ok(catalogValues.has(option), `${option} must come from the catalog`);
});

test('an active filter changes the empty state and offers the reset', () => {
  reset();
  state.query = 'zzzz-no-such-game';
  assert.equal(filteredGames().length, 0);
  assert.equal(filtersActive(), true);
  assert.match(renderCatalog(), /Reset search and filters/);
  reset();
});
