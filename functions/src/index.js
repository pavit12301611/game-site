/**
 * Cloud Functions entry point.
 * Currently disabled — the backend runs as Vercel serverless functions under api/.
 * This file exists for the Firebase Functions deployment path if needed later.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Scheduled cleanup
exports.cleanupExpired = functions.pubsub.schedule('every 15 minutes').onRun(async () => {
  const db = admin.firestore();
  const now = Date.now();
  let deleted = 0;

  const roomSnap = await db.collection('rooms').where('createdAt', '<', new Date(now - 3600000)).get();
  for (const doc of roomSnap.docs) { await doc.ref.delete(); deleted++; }

  console.log(`Cleanup: deleted ${deleted} expired documents.`);
});