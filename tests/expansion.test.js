import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, createInitialGameState, applyGameAction } from '../src/catalog.js';
import { EXPANSION_GAMES } from '../src/expansion.js';

const players = [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }, { uid: 'c', name: 'C' }];
test('expansion adds exactly 120 unique rule presets, with 20 WebGL arenas', () => {
  assert.equal(EXPANSION_GAMES.length, 120);
  assert.equal(GAMES.length, 160);
  assert.equal(EXPANSION_GAMES.filter(g => g.options.dimension === '3D').length, 20);
  assert.equal(new Set(EXPANSION_GAMES.map(g => `${g.engine}:${JSON.stringify(g.options)}`)).size, 120);
});
test('every expansion maze has a legal winning route from every player start', () => {
  const layouts = new Set();
  for (const game of EXPANSION_GAMES.filter(g => g.engine === 'maze')) {
    const initial = createInitialGameState(game, players);
    layouts.add(JSON.stringify(initial.walls));
    for (const player of players) {
      const queue = [[initial.positions[player.uid], []]];
      const visited = new Set(); let path;
      while (queue.length) {
        const [pos, route] = queue.shift();
        const key = pos.y * initial.width + pos.x;
        if (visited.has(key)) continue;
        visited.add(key);
        if (pos.x === initial.goal.x && pos.y === initial.goal.y) { path = route; break; }
        for (const [direction, dx, dy] of [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]]) {
          const x = pos.x + dx, y = pos.y + dy;
          if (x >= 0 && x < initial.width && y >= 0 && y < initial.height && !initial.walls.includes(y * initial.width + x)) queue.push([{ x, y }, [...route, direction]]);
        }
      }
      assert.ok(path, `${game.id}/${player.uid} is solvable`);
      let match = initial;
      for (const direction of path) match = applyGameAction(game, match, player.uid, { direction }, players);
      assert.equal(match.winnerUid, player.uid);
      assert.equal(match.phase, 'finished');
    }
  }
  assert.equal(layouts.size, 10);
});
