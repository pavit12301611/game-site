/**
 * No name that does not exist may reach production.
 *
 * The blank-page outage: src/app.js called `processGoogleRedirect()` and `refreshAccount()` without
 * importing them. Rollup treats an unknown identifier as a global, so `npm run build` stayed green;
 * jsconfig.json excluded src/app.js, so `npm run typecheck` never looked; and the calls sat inside
 * `if (firebaseReady)`, which no local run or CI job ever enters. The page threw before the first
 * paint, on Vercel only.
 *
 * This test closes that hole for good. It runs `tsc` from the browser entry point (src/main.js),
 * following every import the bundler would follow, and fails on the one family of diagnostics
 * that means "this will be a ReferenceError / a failed import at run time":
 *
 *   TS2304  Cannot find name 'X'.
 *   TS2552  Cannot find name 'X'. Did you mean 'Y'?
 *   TS2305  Module 'M' has no exported member 'X'.
 *   TS2724  Module 'M' has no exported member 'X'. Did you mean 'Y'?
 *
 * Every other diagnostic is ignored here on purpose: `npm run typecheck` owns type quality, this
 * test owns "the code can at least be linked". The second test proves the detector itself works, so
 * a broken flag or a changed tsc output format can never make the first test pass by accident.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tscBin = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin', 'tsc');
const entryConfig = path.join(root, 'tests', 'tsconfig.entry-point.json');

/** The diagnostics that mean a name or an export does not exist. */
const UNRESOLVED = new Set([2304, 2552, 2305, 2724]);
/** Option / config / "no inputs" problems: the check itself is broken, which must also fail. */
const BROKEN_CHECK = (code) => (code >= 5000 && code < 7000) || code === 18003;

const DIAGNOSTIC = /^(.+?)\((\d+),(\d+)\): error TS(\d+): (.*)$/;

/**
 * Runs tsc on a config file and returns its parsed diagnostics.
 * @param {string} configPath
 */
function typecheck(configPath) {
  const result = spawnSync(process.execPath, [tscBin, '-p', configPath, '--pretty', 'false'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(result.error, undefined, `tsc could not be started: ${result.error?.message}`);
  // 0: clean. 1 / 2: diagnostics were reported. Anything else is a crash.
  assert.ok([0, 1, 2].includes(result.status ?? -1), `tsc crashed (exit ${result.status}, signal ${result.signal}):\n${result.stderr}\n${result.stdout}`);
  const diagnostics = [];
  for (const line of `${result.stdout}\n${result.stderr}`.split(/\r?\n/)) {
    const match = DIAGNOSTIC.exec(line);
    if (!match) continue;
    diagnostics.push({ file: match[1], line: Number(match[2]), code: Number(match[4]), message: match[5], raw: line });
  }
  return { diagnostics, output: result.stdout + result.stderr };
}

test('every module reachable from src/main.js resolves every name and import it uses', () => {
  const { diagnostics, output } = typecheck(entryConfig);
  const broken = diagnostics.filter((d) => BROKEN_CHECK(d.code));
  assert.deepEqual(broken.map((d) => d.raw), [], `the entry-point typecheck is misconfigured:\n${output}`);
  const unresolved = diagnostics.filter((d) => UNRESOLVED.has(d.code));
  assert.deepEqual(
    unresolved.map((d) => d.raw),
    [],
    'A name is used but never imported or declared. This is a ReferenceError in the browser - add the import.',
  );
  // Sanity: the run really covered the app, not an empty program.
  assert.ok(/"files"|main\.js/.test(JSON.stringify(require(entryConfig))), 'the config starts at the entry point');
});

test('npm run typecheck covers every src module: nothing under src/ is excluded again', () => {
  const jsconfig = require(path.join(root, 'jsconfig.json'));
  assert.ok(jsconfig.include.includes('src/**/*.js'), 'all of src/ is in scope');
  const excludedSources = (jsconfig.exclude || []).filter((pattern) => /(^|\/)src(\/|$)/.test(pattern));
  assert.deepEqual(excludedSources, [], 'src/app.js and src/main.js were excluded once; that is how the blank page shipped');
  assert.equal(jsconfig.compilerOptions.checkJs, true);
});

test('the detector catches a missing import, a typo and an import of a non-existent export', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'psd-unresolved-'));
  try {
    writeFileSync(path.join(dir, 'helper.js'), 'export function refreshAccount() {}\n');
    writeFileSync(path.join(dir, 'broken.js'), [
      "import { refreshAcount } from './helper.js';", // TS2724: did you mean 'refreshAccount'?
      "import { nothingHere } from './helper.js';", // TS2305: no exported member
      'void processGoogleRedirect();', // TS2304: missing import
      'void refreshAcount;',
      'void nothingHere;',
      '',
    ].join('\n'));
    writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
      extends: entryConfig,
      files: ['./broken.js'],
      include: [],
    }));
    const { diagnostics } = typecheck(path.join(dir, 'tsconfig.json'));
    const codes = new Set(diagnostics.filter((d) => UNRESOLVED.has(d.code)).map((d) => d.code));
    assert.ok(codes.has(2304), 'a call to a name that is never imported is reported (TS2304)');
    assert.ok(codes.has(2305) || codes.has(2724), 'an import of a name the module does not export is reported');
    const missing = diagnostics.find((d) => d.code === 2304);
    assert.match(missing.message, /processGoogleRedirect/, 'the message names the identifier');
    assert.match(missing.file, /broken\.js$/, 'the file is reported, so the failure is actionable');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
