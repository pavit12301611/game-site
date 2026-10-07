/**
 * Vercel serverless route for the `adminTrainReviewAgent` backend action.
 *
 * This replaces the Firebase `adminTrainReviewAgent` callable. The browser POSTs here with its Firebase ID token
 * in the Authorization header; the shared wiring in ./_backend.js verifies the token, runs the
 * handler from functions/src/handlers.js and returns its payload as JSON.
 */
import { handleCallable } from './_backend.js';

export default function handler(req, res) {
  return handleCallable('adminTrainReviewAgent', req, res);
}
