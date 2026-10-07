const { getDb, verifyToken } = require('./_backend');
const admin = require('firebase-admin');

module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const db = getDb();
    const { roomId } = req.body;

    const roomRef = db.collection('rooms').doc(roomId);
    const roomDoc = await roomRef.get();
    if (!roomDoc.exists) return res.json({ ok: true });

    const room = roomDoc.data();
    const remaining = room.playerUids.filter(uid => uid !== user.uid);

    if (remaining.length === 0) {
      await roomRef.delete();
    } else {
      const update = {
        playerUids: remaining,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (room.hostUid === user.uid) update.hostUid = remaining[0];
      await roomRef.update(update);
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};