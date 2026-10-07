import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, GENRES, getGame, filterGames } from '../src/games/registry.js';

describe('catalog', () => {
  it('ships 12 games with unique ids', () => {
    assert.equal(GAMES.length, 12);
    assert.equal(new Set(GAMES.map((g) => g.id)).size, 12);
  });

  it('every game has complete metadata', () => {
    for (const g of GAMES) {
      for (const key of ['id', 'name', 'tagline', 'genre', 'icon']) {
        assert.ok(typeof g[key] === 'string' && g[key].length > 0, `${g.id}.${key}`);
      }
      assert.ok(['solo', '2p', 'both'].includes(g.players), `${g.id}.players`);
      assert.ok(Array.isArray(g.modes) && g.modes.length > 0, `${g.id}.modes`);
      for (const m of g.modes) {
        assert.ok(m.id && m.label, `${g.id} mode ${JSON.stringify(m)}`);
      }
      assert.ok(
        g.difficulties === null ||
          g.difficulties === undefined ||
          (Array.isArray(g.difficulties) && g.difficulties.length > 0),
        `${g.id}.difficulties`,
      );
      assert.ok(Array.isArray(g.howTo) && g.howTo.length >= 2, `${g.id}.howTo`);
      assert.equal(typeof g.mount, 'function', `${g.id}.mount`);
      assert.equal(typeof g.hue, 'number', `${g.id}.hue`);
    }
  });

  it('covers at least 4 genres and every player shape', () => {
    assert.ok(GENRES.length >= 4);
    const shapes = new Set(GAMES.map((g) => g.players));
    assert.ok(shapes.has('solo') || shapes.has('both'));
    assert.ok(shapes.has('2p') || shapes.has('both'));
  });

  it('getGame resolves by id', () => {
    assert.equal(getGame('snake').name, 'Snake');
    assert.equal(getGame('nope'), null);
  });

  it('filterGames searches and filters', () => {
    const snakes = filterGames({ q: 'snake' });
    assert.equal(snakes.length, 1);
    assert.equal(snakes[0].id, 'snake');
    const strategy = filterGames({ genre: 'Strategy' });
    assert.ok(strategy.length >= 2);
    assert.ok(strategy.every((g) => g.genre === 'Strategy'));
    const solo = filterGames({ players: 'Solo' });
    assert.ok(solo.length > 0 && solo.every((g) => g.players !== '2p'));
    const twoP = filterGames({ players: '2P' });
    assert.ok(twoP.length > 0 && twoP.every((g) => g.players !== 'solo'));
  });
});
