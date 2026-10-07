const { getDb, verifyToken } = require('./_backend');
const admin = require('firebase-admin');
module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const db = getDb();
    const { requestId, accept } = req.body;
    const reqDoc = await db.collection('friendRequests').doc(requestId).get();
    if (!reqDoc.exists) return res.status(404).json({ error: 'Request not found.' });
    if (reqDoc.data().toUid !== user.uid) return res.status(403).json({ error: 'Not your request.' });
    if (accept) {
      const fromUid = reqDoc.data().fromUid;
      await db.collection('friendships').add({ members: [user.uid, fromUid], createdAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    await reqDoc.ref.delete();
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
};