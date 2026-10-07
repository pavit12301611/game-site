const admin = require('firebase-admin');
const { getDb } = require('./_backend');

module.exports = async (req, res) => {
  try {
    const db = getDb();
    const now = Date.now();
    let deleted = 0;

    // Clean up expired rooms (1 hour)
    const roomSnap = await db.collection('rooms').where('createdAt', '<', new Date(now - 60 * 60 * 1000)).get();
    for (const doc of roomSnap.docs) { await doc.ref.delete(); deleted++; }

    // Clean up expired invites (24 hours)
    const invSnap = await db.collection('gameInvites').where('createdAt', '<', new Date(now - 24 * 60 * 60 * 1000)).get();
    for (const doc of invSnap.docs) { await doc.ref.delete(); deleted++; }

    // Clean up old friend requests (72 hours)
    const reqSnap = await db.collection('friendRequests').where('createdAt', '<', new Date(now - 72 * 60 * 60 * 1000)).get();
    for (const doc of reqSnap.docs) { await doc.ref.delete(); deleted++; }

    // Clean up old reports (30 days)
    const repSnap = await db.collection('reports').where('createdAt', '<', new Date(now - 30 * 24 * 60 * 60 * 1000)).get();
    for (const doc of repSnap.docs) { await doc.ref.delete(); deleted++; }

    res.json({ ok: true, deleted });
  } catch (error) { res.status(500).json({ error: error.message }); }
};