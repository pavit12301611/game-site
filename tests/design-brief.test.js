/**
 * Keeps docs/design-reboot.md honest.
 *
 * The brief makes measurable claims (contrast ratios, "all 40 games", "every board action is kept").
 * This test recomputes them from the document itself and from the source, so the brief cannot drift:
 * change a colour in the table without re-measuring it, add a game without briefing its photo, or
 * rename a board `data-action`, and `npm test` says so.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GAMES, engineIds } from '../src/catalog.js';

const ENGINES = engineIds();

const brief = readFileSync(new URL('../docs/design-reboot.md', import.meta.url), 'utf8');
const boardsSource = readFileSync(new URL('../src/views/boards.js', import.meta.url), 'utf8');

/** WCAG 2.x relative luminance of `#rrggbb`. */
function luminance(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground, background) {
  const [hi, lo] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const cells = (line) => line.split('|').slice(1, -1).map((cell) => cell.trim());
const HEX = /^#[0-9A-Fa-f]{6}$/;

const tokens = { dark: {}, light: {} };
for (const line of brief.split('\n')) {
  const row = cells(line);
  if (row.length === 4 && /^`--[a-z0-9-]+`$/.test(row[0]) && HEX.test(row[1]) && HEX.test(row[2])) {
    tokens.dark[row[0].slice(1, -1)] = row[1];
    tokens.light[row[0].slice(1, -1)] = row[2];
  }
}

/** Every "Context | Foreground | Background | FG hex | BG hex | Ratio | Needs" row of the brief. */
const contrastRows = brief.split('\n').map(cells).filter((row) => row.length === 7 && HEX.test(row[3]) && HEX.test(row[4]));

test('the brief defines both themes for every colour token', () => {
  assert.deepEqual(Object.keys(tokens.dark), Object.keys(tokens.light));
  for (const name of ['--bg', '--surface-1', '--surface-2', '--surface-3', '--ink', '--ink-muted', '--ink-subtle', '--control-edge', '--primary', '--on-primary', '--focus-ring', '--ok', '--bad', '--warn', '--info']) {
    assert.ok(tokens.dark[name], `${name} is missing`);
  }
});

test('every contrast figure in the brief is the real WCAG ratio and meets its requirement', () => {
  assert.ok(contrastRows.length >= 40, `expected at least 40 measured pairs, found ${contrastRows.length}`);
  for (const [context, fgName, bgName, fgHex, bgHex, ratio, needs] of contrastRows) {
    const label = `${context}: ${fgName} on ${bgName}`;
    const measured = contrast(fgHex, bgHex);
    assert.ok(Math.abs(measured - Number(ratio)) < 0.011, `${label}: document says ${ratio}, real ratio is ${measured.toFixed(2)}`);
    assert.ok(measured >= Number.parseFloat(needs), `${label}: ${measured.toFixed(2)} is below ${needs}`);
    if (context === 'dark' || context === 'light') {
      const fgToken = fgName.replaceAll('`', '');
      const bgToken = bgName.replaceAll('`', '');
      assert.equal(fgHex, tokens[context][fgToken], `${label}: foreground hex differs from the token table`);
      assert.equal(bgHex, tokens[context][bgToken], `${label}: background hex differs from the token table`);
    }
  }
});

test('theme pairs cover text, primary, status and UI colours in both themes', () => {
  for (const theme of ['dark', 'light']) {
    const rows = contrastRows.filter((row) => row[0] === theme);
    for (const token of ['--ink', '--ink-muted', '--ink-subtle', '--primary', '--on-primary', '--ok', '--bad', '--warn', '--info', '--control-edge', '--focus-ring']) {
      assert.ok(rows.some((row) => row[1].includes(`\`${token}\``)), `${theme} theme has no measured pair for ${token}`);
    }
  }
});

test('the per-game image brief lists all games, once each, with the right engine', () => {
  const rows = new Map();
  for (const line of brief.split('\n')) {
    const row = cells(line);
    if (row.length === 3 && /^`[a-z0-9-]+`$/.test(row[0]) && ENGINES.includes(row[1])) rows.set(row[0].slice(1, -1), row[1]);
  }
  assert.equal(rows.size, GAMES.length);
  for (const game of GAMES) {
    assert.equal(rows.get(game.id), game.engine, `${game.id} is missing from the image brief or lists the wrong engine`);
  }
});

test('the board spec covers every engine and keeps every board data-action', () => {
  assert.equal(ENGINES.length, 10);
  for (const engine of ENGINES) {
    assert.ok(brief.includes(`| **${engine}**`) || brief.includes(`| **${engine} /`), `no board spec row for engine "${engine}"`);
  }
  const actions = new Set([...boardsSource.matchAll(/data-action=\\?"([a-z-]+)\\?"/g)].map((match) => match[1]));
  assert.ok(actions.size >= 12, 'expected the board actions to be found in src/views/boards.js');
  for (const action of actions) {
    assert.ok(brief.includes(`\`${action}`), `board action "${action}" is not listed in the brief's contract`);
  }
});

test('the brief never asks for text below 13 px and keeps the three installed font packages', () => {
  const scale = [...brief.matchAll(/^\| `--fs-\d` \| (?:clamp\()?(\d+)/gm)].map((match) => Number(match[1]));
  assert.ok(scale.length >= 8);
  assert.ok(Math.min(...scale) >= 13);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const font of ['chakra-petch', 'inter', 'jetbrains-mono']) {
    assert.ok(pkg.dependencies[`@fontsource/${font}`], `@fontsource/${font} must stay installed`);
  }
});
