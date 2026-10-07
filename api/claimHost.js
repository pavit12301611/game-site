const { getDb, verifyToken } = require('./_backend');
module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const db = getDb();
    const roomDoc = await db.collection('rooms').doc(req.body.roomId).get();
    if (!roomDoc.exists) return res.status(404).json({ error: 'Room not found.' });
    const room = roomDoc.data();
    if (!room.playerUids.includes(user.uid)) return res.status(403).json({ error: 'Not in room.' });
    if (room.hostUid === user.uid) return res.json({ changed: false });
    await roomDoc.ref.update({ hostUid: user.uid });
    res.json({ changed: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
};