const { getDb, verifyToken } = require('./_backend');
module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const db = getDb();
    const { inviteId, accept } = req.body;
    const inviteDoc = await db.collection('gameInvites').doc(inviteId).get();
    if (!inviteDoc.exists) return res.status(404).json({ error: 'Invite not found.' });
    if (inviteDoc.data().toUid !== user.uid) return res.status(403).json({ error: 'Not your invite.' });
    if (accept) {
      // Join the room if roomId present
      const roomId = inviteDoc.data().roomId;
      if (roomId) {
        const roomRef = db.collection('rooms').doc(roomId);
        const roomDoc = await roomRef.get();
        if (roomDoc.exists && roomDoc.data().playerUids.length < roomDoc.data().maxPlayers) {
          await roomRef.update({
            playerUids: require('firebase-admin').firestore.FieldValue.arrayUnion(user.uid),
            updatedAt: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    }
    await inviteDoc.ref.delete();
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
};