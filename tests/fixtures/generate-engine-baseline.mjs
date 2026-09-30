/**
 * Regenerates tests/fixtures/engine-baseline.json from a given catalog module.
 *
 *   node tests/fixtures/generate-engine-baseline.mjs                    # from src/catalog.js
 *   node tests/fixtures/generate-engine-baseline.mjs /tmp/catalog.mjs   # from any other build
 *
 * The fixture is a set of SHA-256 fingerprints of every engine state, not the states themselves,
 * so it stays a few kilobytes. `tests/engine-baseline.test.js` replays the same script against
 * the current engines and compares; a mismatch means game behaviour changed, on purpose or not.
 *
 * Only re-run this when a behaviour change is intended, and say so in the PR.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../../src/catalog.js';
import { MAX_MOVES, replay } from '../engine-driver.js';

const source = process.argv[2];
const { createInitialGameState, applyGameAction } = source
  ? await import(source.startsWith('/') ? source : fileURLToPath(new URL(source, import.meta.url)))
  : await import('../../src/catalog.js');

const playerSets = [
  ['2', [{ uid: 'p1', name: 'One' }, { uid: 'p2', name: 'Two' }]],
  ['3', [{ uid: 'p1', name: 'One' }, { uid: 'p2', name: 'Two' }, { uid: 'p3', name: 'Three' }]],
];

const games = {};
for (const game of GAMES) {
  const byPlayers = {};
  for (const [label, players] of playerSets) {
    const { hashes, applied, errors, finished, winnerUid } = replay({
      game,
      players,
      seed: `baseline:${game.id}`,
      createInitialGameState,
      applyGameAction,
    });
    byPlayers[label] = { hashes, applied, rejected: errors.length, finished, winnerUid };
  }
  games[game.id] = byPlayers;
}

const fixture = {
  /** Bump when the driver or the fingerprint format changes so stale fixtures cannot pass silently. */
  version: 1,
  algorithm: 'sha256-32 of canonical JSON (sorted keys)',
  maxMoves: MAX_MOVES,
  gameCount: GAMES.length,
  games,
};

const outPath = fileURLToPath(new URL('./engine-baseline.json', import.meta.url));
writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`Wrote ${GAMES.length} games to ${outPath}`);
