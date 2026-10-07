const { getDb, verifyToken } = require('./_backend');
module.exports = async (req, res) => {
  try {
    await verifyToken(req);
    const db = getDb();
    const term = (req.body.username || '').toLowerCase();
    if (!term) return res.json({ users: [] });
    const snap = await db.collection('profiles').where('usernameLower', '>=', term).where('usernameLower', '<=', term + '\uf8ff').limit(10).get();
    res.json({ users: snap.docs.map(d => ({ uid: d.id, ...d.data() })) });
  } catch (error) { res.status(400).json({ error: error.message }); }
};