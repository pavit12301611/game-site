const { getDb, verifyToken } = require('./_backend');
const admin = require('firebase-admin');
module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const db = getDb();
    const { username } = req.body;
    const usernameDoc = await db.collection('usernames').doc(username.toLowerCase()).get();
    if (!usernameDoc.exists) return res.status(404).json({ error: 'User not found.' });
    const targetUid = usernameDoc.data().uid;
    if (targetUid === user.uid) return res.status(400).json({ error: 'Cannot add yourself.' });
    await db.collection('friendRequests').add({ fromUid: user.uid, toUid: targetUid, fromName: req.body.fromName || '', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
};