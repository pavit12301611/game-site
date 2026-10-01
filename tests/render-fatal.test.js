/**
 * The recovery screen: what a visitor sees if drawing the app ever throws.
 *
 * These tests are deliberately independent of jsdom and Firebase - `renderFatal` takes an error and
 * returns a string, so it can be checked anywhere.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFatal } from '../src/views/fatal.js';

test('it explains what happened and offers a way back', () => {
  const html = renderFatal(new Error('Cannot read properties of undefined'));
  assert.match(html, /role="alert"/);
  assert.match(html, /Something went wrong/);
  assert.match(html, /Cannot read properties of undefined/);
  assert.match(html, /data-action="reload"/);
  assert.match(html, /href="#\/home"/);
});

test('it escapes the error, because an error message can contain markup', () => {
  const html = renderFatal(new Error('<img src=x onerror="alert(1)">'));
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test('it survives anything being thrown, including non-errors', () => {
  for (const thrown of [undefined, null, 'boom', { message: 42 }, new Error('')]) {
    const html = renderFatal(thrown);
    assert.match(html, /Something went wrong/);
    assert.doesNotMatch(html, /undefined|\[object Object\]/);
  }
});

test('an absurdly long message cannot blow up the layout', () => {
  const html = renderFatal(new Error('x'.repeat(5000)));
  assert.ok(html.length < 2000, `expected a capped message, got ${html.length} characters`);
});
