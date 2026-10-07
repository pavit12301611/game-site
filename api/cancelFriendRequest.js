/**
 * Vercel serverless route for the `cancelFriendRequest` backend action.
 *
 * This replaces the Firebase `cancelFriendRequest` callable. The browser POSTs here with its Firebase ID token
 * in the Authorization header; the shared wiring in ./_backend.js verifies the token, runs the
 * handler from functions/src/handlers.js and returns its payload as JSON.
 */
import { handleCallable } from './_backend.js';

export default function handler(req, res) {
  return handleCallable('cancelFriendRequest', req, res);
}
