import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The online backend is a set of Vercel routes in api/ that the browser reaches through
 * `callBackend('<name>', …)` in src/online/callables.js. Two things must stay true or online play
 * breaks with a 404 the player cannot act on:
 *
 *   1. every `callBackend('<name>')` the browser makes has a matching `api/<name>.js`, and
 *   2. each `api/<name>.js` actually dispatches to `handleCallable('<name>')` — a typo in the name
 *      would silently route the wrong action.
 *
 * This test reads the source rather than importing it, so it needs no Firebase, no build and no
 * network — the same spirit as tests/vercel-headers.test.js and tests/no-secrets-in-repo.test.js.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const apiDir = join(root, 'api');
const srcDir = join(root, 'src');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : full.endsWith('.js') ? [full] : [];
  });
}

const routeFiles = readdirSync(apiDir).filter((name) => name.endsWith('.js'));
const callableRoutes = routeFiles.filter((name) => name !== '_backend.js' && name !== 'cleanup.js');

test('the shared wiring and the cleanup cron route are present', () => {
  assert.ok(routeFiles.includes('_backend.js'), 'api/_backend.js holds the shared wiring');
  assert.ok(routeFiles.includes('cleanup.js'), 'api/cleanup.js is the scheduled-cleanup cron route');
});

test('the api folder carries one route per former callable', () => {
  // The disabled Cloud Functions entry exported 24 callables; the api folder must match.
  assert.ok(
    callableRoutes.length >= 24,
    `expected at least the 24 callable routes, found ${callableRoutes.length}`,
  );
});

test('each api route dispatches to its own name', () => {
  for (const file of callableRoutes) {
    const name = file.replace(/\.js$/, '');
    const source = readFileSync(join(apiDir, file), 'utf8');
    const match = /handleCallable\(\s*'([^']+)'/.exec(source);
    assert.ok(match, `api/${file} must call handleCallable('<name>')`);
    assert.equal(match[1], name, `api/${file} dispatches to '${match[1]}' but should dispatch to '${name}'`);
  }
});

test('every backend action the browser calls has a matching api route', () => {
  const routes = new Set(callableRoutes.map((file) => file.replace(/\.js$/, '')));
  const called = new Set();
  for (const file of walk(srcDir)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/callBackend\(\s*'([^']+)'/g)) called.add(match[1]);
  }
  assert.ok(called.size >= 20, `the browser should call many backend actions, found ${called.size}`);
  for (const name of called) {
    assert.ok(routes.has(name), `the browser calls callBackend('${name}') but api/${name}.js is missing`);
  }
});
