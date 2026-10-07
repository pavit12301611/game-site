/**
 * Shared backend entry: initializes Firebase Admin SDK for Vercel serverless functions.
 * Every api/*.js route imports this to get a verified Admin SDK instance.
 */

const admin = require('firebase-admin');

let app = null;

function getAdmin() {
  if (app) return app;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set.');
  const creds = JSON.parse(sa);
  app = admin.initializeApp({ credential: admin.credential.cert(creds) });
  return app;
}

function getDb() {
  return getAdmin().firestore();
}

function getAuth() {
  return getAdmin().auth();
}

/**
 * Verifies the caller's Firebase ID token from the Authorization header.
 */
async function verifyToken(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new Error('Missing authorization token.');
  return getAuth().verifyIdToken(token);
}

module.exports = { getAdmin, getDb, getAuth, verifyToken };