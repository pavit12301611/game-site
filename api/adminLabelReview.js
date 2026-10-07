const { getDb, verifyToken } = require('./_backend');
module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const db = getDb();
    const adminDoc = await db.collection('admins').doc(user.uid).get();
    if (!adminDoc.exists || !adminDoc.data()?.admin) return res.status(403).json({ error: 'Admin access required.' });
    await db.collection('reviews').doc(req.body.reviewId).update({ label: req.body.label });
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
};