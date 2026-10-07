const { getDb, verifyToken } = require('./_backend');
module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const db = getDb();
    const snap = await db.collection('blocks').where('blockerUid', '==', user.uid).where('blockedUid', '==', req.body.uid).get();
    for (const doc of snap.docs) await doc.ref.delete();
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
};