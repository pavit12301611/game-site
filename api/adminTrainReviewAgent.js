const { getDb, verifyToken } = require('./_backend');
module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const db = getDb();
    const adminDoc = await db.collection('admins').doc(user.uid).get();
    if (!adminDoc.exists || !adminDoc.data()?.admin) return res.status(403).json({ error: 'Admin access required.' });
    res.json({ ok: true, message: 'Training started.' });
  } catch (error) { res.status(400).json({ error: error.message }); }
};