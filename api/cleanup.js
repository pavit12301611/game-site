/**
 * Vercel Cron route for the scheduled data cleanup.
 *
 * This replaces the Firebase \`cleanupExpired\` Cloud Scheduler function. It deletes expired rooms,
 * finished rooms past their grace period, stale invites/requests and empty rate-limit documents,
 * and it is idempotent — a Vercel Cron hit and a manual trigger are equally safe. Wire it up in
 * vercel.json under \`crons\` (every 15 minutes). See api/_backend.js for the optional CRON_SECRET.
 */
import { handleCleanup } from './_backend.js';

export default function handler(req, res) {
  return handleCleanup(req, res);
}
