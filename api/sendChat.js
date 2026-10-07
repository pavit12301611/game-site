const { getDb, verifyToken } = require('./_backend');
const admin = require('firebase-admin');
module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const db = getDb();
    const { roomId, text } = req.body;
    if (!text || text.length > 200) return res.status(400).json({ error: 'Message must be under 200 characters.' });
    const roomDoc = await db.collection('rooms').doc(roomId).get();
    if (!roomDoc.exists) return res.status(404).json({ error: 'Room not found.' });
    if (!roomDoc.data().playerUids.includes(user.uid)) return res.status(403).json({ error: 'Not in room.' });
    const chatRef = roomDoc.ref.collection('messages');
    await chatRef.add({ uid: user.uid, text: text.trim(), createdAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
};