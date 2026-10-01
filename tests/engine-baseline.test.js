import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAMES, applyGameAction, createInitialGameState } from '../src/catalog.js';
import { MAX_MOVES, replay } from './engine-driver.js';

/**
 * Guards the game rules against accidental change.
 *
 * `tests/fixtures/engine-baseline.json` holds SHA-256 fingerprints of every engine state,
 * captured from the catalog before the engines were extracted into src/engines/*.js. The same
 * deterministic script (tests/engine-driver.js) is replayed here against the current code, so a
 * refactor that changes any rule, any win condition or any random seed fails this test.
 *
 * If a change IS intended: run `node tests/fixtures/generate-engine-baseline.mjs`, commit the new
 * fixture, and explain the behaviour change in the PR.
 */
const fixture = JSON.parse(readFileSync(new URL('./fixtures/engine-baseline.json', import.meta.url), 'utf8'));

const playerSets = [
  ['2', [{ uid: 'p1', name: 'One' }, { uid: 'p2', name: 'Two' }]],
  ['3', [{ uid: 'p1', name: 'One' }, { uid: 'p2', name: 'Two' }, { uid: 'p3', name: 'Three' }]],
];

test('the engine baseline fixture matches this build of the catalog', () => {
  assert.equal(fixture.version, 1, 'unexpected fixture version — regenerate the baseline');
  assert.equal(fixture.maxMoves, MAX_MOVES, 'the driver and the fixture disagree on the script length');
  assert.equal(fixture.gameCount, GAMES.length, 'the catalog changed size — regenerate the baseline');
  assert.deepEqual(Object.keys(fixture.games).sort(), GAMES.map((game) => game.id).sort());
});

for (const game of GAMES) {
  test(`${game.title} plays out exactly as it did before the engines were extracted`, () => {
    const expected = fixture.games[game.id];
    assert.ok(expected, `${game.id} is missing from the engine baseline fixture`);
    for (const [label, players] of playerSets) {
      const actual = replay({
        game,
        players,
        seed: `baseline:${game.id}`,
        createInitialGameState,
        applyGameAction,
      });
      const want = expected[label];
      assert.equal(actual.applied, want.applied, `${game.id} (${label}p): a different number of moves was accepted`);
      assert.equal(actual.rejected, want.rejected, `${game.id} (${label}p): a different number of moves was rejected`);
      assert.equal(actual.finished, want.finished, `${game.id} (${label}p): the match ends at a different point`);
      assert.equal(actual.winnerUid, want.winnerUid, `${game.id} (${label}p): a different player wins`);
      assert.deepEqual(actual.hashes, want.hashes, `${game.id} (${label}p): the game state itself changed`);
    }
  });
}
