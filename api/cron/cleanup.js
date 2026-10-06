/**
 * The scheduled expiry sweep, as a Vercel serverless function (free tier: runs once a day via
 * Vercel Cron) and as a plain endpoint any external scheduler can call.
 *
 *   GET/POST /api/cron/cleanup      with header `Authorization: Bearer $CRON_SECRET`
 *
 * Vercel Cron sends that header automatically once `CRON_SECRET` exists as an environment
 * variable. For the original 15-minute cadence on the free plan, `.github/workflows/cleanup.yml`
 * calls this endpoint on a GitHub Actions schedule using the same secret — Vercel's daily run is
 * the always-on fallback, and the sweep itself is idempotent, so overlapping runs are harmless.
 */

import { backendApi, sendJson } from '../../functions/src/http-backend.js';

export default async function handler(req, res) {
  const result = await backendApi().handleCleanup({
    authorization: req.headers.authorization,
  });
  sendJson(res, result.status, result.json);
}
