import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { createRoom } from '../src/index.js';

/**
 * Send a real HTTP preflight through the exported callable handler. This exercises the exact CORS
 * middleware Firebase will deploy, without contacting a live Firebase project or needing auth.
 * @param {string} origin
 */
async function preflight(origin) {
  const server = createServer(createRoom);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const response = await globalThis.fetch(`http://127.0.0.1:${address.port}/createRoom`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,x-firebase-appcheck',
      },
    });
    const result = {
      status: response.status,
      allowOrigin: response.headers.get('access-control-allow-origin'),
      allowMethods: response.headers.get('access-control-allow-methods'),
      allowHeaders: response.headers.get('access-control-allow-headers'),
    };
    await response.arrayBuffer();
    return result;
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test('createRoom answers the production Vercel preflight with the requested origin', async () => {
  const origin = 'https://psd-gaming.vercel.app';
  const response = await preflight(origin);

  assert.equal(response.status, 204);
  assert.equal(response.allowOrigin, origin);
  assert.match(response.allowMethods || '', /POST/i);
  assert.match(response.allowHeaders || '', /authorization/i);
});

test('createRoom permits this project’s Vercel previews and local development', async () => {
  for (const origin of [
    'https://psd-gaming-git-fix-room-create-pavit12301611.vercel.app',
    'http://localhost:5173',
    'http://127.0.0.1:8080',
  ]) {
    const response = await preflight(origin);
    assert.equal(response.status, 204, `${origin} should preflight successfully`);
    assert.equal(response.allowOrigin, origin, `${origin} should be echoed by the CORS middleware`);
  }
});

test('createRoom does not grant CORS access to unrelated origins', async () => {
  const response = await preflight('https://another-project.vercel.app');
  assert.notEqual(response.allowOrigin, 'https://another-project.vercel.app');
});
