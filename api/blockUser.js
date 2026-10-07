const { getDb, verifyToken } = require('./_backend');
const admin = require('firebase-admin');
module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    await getDb().collection('blocks').add({ blockerUid: user.uid, blockedUid: req.body.uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
};