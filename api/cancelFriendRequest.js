const { getDb, verifyToken } = require('./_backend');
module.exports = async (req, res) => {
  try { const user = await verifyToken(req); const db = getDb(); await db.collection('friendRequests').doc(req.body.requestId).delete(); res.json({ ok: true }); }
  catch (error) { res.status(400).json({ error: error.message }); }
};