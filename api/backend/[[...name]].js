/**
 * The trusted backend, mounted as a same-origin Vercel serverless function — the deployment that
 * needs no Firebase Blaze plan.
 *
 *   POST /api/backend/<callable>
 *
 * All policy lives in `functions/src/http-backend.js`; this file only adapts Vercel's request and
 * response objects. Because the route is same-origin, the browser needs no CORS preflight at all
 * (the CSP's `connect-src 'self'` already covers it), and the caller's identity is proven with a
 * Firebase ID token the backend verifies with the Admin SDK.
 */

import { backendApi, sendJson } from '../../functions/src/http-backend.js';

export default async function handler(req, res) {
  // Vercel's catch-all query parameter: a string for one path segment, an array for more.
  const raw = req.query.name;
  const name = Array.isArray(raw) ? raw.join('/') : String(raw || '');
  const result = await backendApi().handleCall({
    name,
    method: req.method,
    authorization: req.headers.authorization,
    body: req.body,
  });
  sendJson(res, result.status, result.json);
}
