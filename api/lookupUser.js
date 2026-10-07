/**
 * Vercel serverless route for the `lookupUser` backend action.
 *
 * This replaces the Firebase `lookupUser` callable. The browser POSTs here with its Firebase ID token
 * in the Authorization header; the shared wiring in ./_backend.js verifies the token, runs the
 * handler from functions/src/handlers.js and returns its payload as JSON.
 */
import { handleCallable } from './_backend.js';

export default function handler(req, res) {
  return handleCallable('lookupUser', req, res);
}
