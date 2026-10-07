const { getDb, verifyToken } = require('./_backend');
module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const db = getDb();
    const adminDoc = await db.collection('admins').doc(user.uid).get();
    if (!adminDoc.exists || !adminDoc.data()?.admin) return res.status(403).json({ error: 'Admin access required.' });
    const { uid } = req.body;
    await db.collection('profiles').doc(uid).delete().catch(() => {});
    const profile = await db.collection('profiles').doc(uid).get().catch(() => null);
    if (profile?.data()?.usernameLower) await db.collection('usernames').doc(profile.data().usernameLower).delete().catch(() => {});
    await db.collection('admins').doc(uid).delete().catch(() => {});
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
};