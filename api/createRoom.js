const { getDb, verifyToken } = require('./_backend');
const { v4: uuidv4 } = require('crypto');
const admin = require('firebase-admin');

module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const db = getDb();
    const { gameId, maxPlayers, displayName, friendUid } = req.body;

    if (!gameId || !maxPlayers) return res.status(400).json({ error: 'Missing gameId or maxPlayers.' });

    const roomId = uuidv4().slice(0, 12);
    const code = Math.random().toString(36).slice(2, 9).toUpperCase();
    const playerNames = { [user.uid]: displayName || 'Player' };

    await db.collection('rooms').doc(roomId).set({
      gameId,
      maxPlayers: Math.min(3, Math.max(2, Number(maxPlayers))),
      hostUid: user.uid,
      playerUids: [user.uid],
      playerNames,
      code,
      status: 'waiting',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ roomId, code });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};