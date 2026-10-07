const { getDb, verifyToken } = require('./_backend');
const admin = require('firebase-admin');
module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const db = getDb();
    const { username } = req.body;
    const unameLower = (username || '').toLowerCase();
    const existing = await db.collection('usernames').doc(unameLower).get();
    if (existing.exists && existing.data().uid !== user.uid) return res.status(400).json({ error: 'Username taken.' });
    await db.collection('usernames').doc(unameLower).set({ uid: user.uid, claimedAt: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection('profiles').doc(user.uid).set({ username, usernameLower: unameLower, displayName: username, createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
};