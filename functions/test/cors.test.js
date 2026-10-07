import test from 'node:test';
import assert from 'node:assert/strict';

import { CALLABLE_CORS_ORIGINS, isCallableOriginAllowed } from '../src/cors.js';

test('the callable CORS policy includes the production Vercel site and project previews', () => {
  assert.ok(isCallableOriginAllowed('https://psd-gaming.vercel.app'));
  assert.ok(isCallableOriginAllowed('https://psd-gaming-git-fix-room-create-pavit12301611.vercel.app'));
  assert.ok(CALLABLE_CORS_ORIGINS.length > 0, 'the functions must not deploy with an empty CORS allowlist');
});

test('local browser development is allowed on localhost with optional ports', () => {
  for (const origin of ['http://localhost', 'http://localhost:5173', 'http://127.0.0.1:8080']) {
    assert.ok(isCallableOriginAllowed(origin), `${origin} should be allowed`);
  }
});

test('unrelated origins are not granted browser CORS access', () => {
  for (const origin of [
    'https://another-game.vercel.app',
    'https://not-psd-gaming.vercel.app',
    'https://psd-gaming.vercel.app.attacker.example',
    'http://psd-gaming.vercel.app',
    'https://psd-gaming-git-preview.example.com',
  ]) {
    assert.equal(isCallableOriginAllowed(origin), false, `${origin} should not be allowed`);
  }
});
