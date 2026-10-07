const { getDb, verifyToken } = require('./_backend');
const admin = require('firebase-admin');

module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const db = getDb();
    const { roomId, code } = req.body;

    let roomRef;
    if (roomId) {
      roomRef = db.collection('rooms').doc(roomId);
    } else if (code) {
      const snap = await db.collection('rooms').where('code', '==', code.toUpperCase()).limit(1).get();
      if (snap.empty) return res.status(404).json({ error: 'Room not found with that code.' });
      roomRef = snap.docs[0].ref;
    } else {
      return res.status(400).json({ error: 'Provide roomId or code.' });
    }

    const roomDoc = await roomRef.get();
    if (!roomDoc.exists) return res.status(404).json({ error: 'Room not found.' });

    const room = roomDoc.data();
    if (room.status !== 'waiting') return res.status(400).json({ error: 'Room is already in play.' });
    if (room.playerUids.includes(user.uid)) return res.json({ roomId: roomRef.id });
    if (room.playerUids.length >= room.maxPlayers) return res.status(400).json({ error: 'Room is full.' });

    const profile = await db.collection('profiles').doc(user.uid).get().catch(() => null);
    const name = profile?.data()?.displayName || req.body.displayName || 'Player';

    await roomRef.update({
      playerUids: admin.firestore.FieldValue.arrayUnion(user.uid),
      [`playerNames.${user.uid}`]: name,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ roomId: roomRef.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};