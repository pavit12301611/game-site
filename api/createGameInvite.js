const { getDb, verifyToken } = require('./_backend');
const admin = require('firebase-admin');
module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const ref = await getDb().collection('gameInvites').add({ fromUid: user.uid, ...req.body, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ inviteId: ref.id });
  } catch (error) { res.status(400).json({ error: error.message }); }
};