const { getDb, verifyToken } = require('./_backend');
const admin = require('firebase-admin');

module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const db = getDb();
    const { roomId, action, clientActionId } = req.body;

    if (!roomId || !action) return res.status(400).json({ error: 'Missing roomId or action.' });

    const roomRef = db.collection('rooms').doc(roomId);
    const result = await db.runTransaction(async (tx) => {
      const roomDoc = await tx.get(roomRef);
      if (!roomDoc.exists) throw new Error('Room not found.');

      const room = roomDoc.data();
      if (room.status !== 'playing') throw new Error('Room is not in play.');
      if (!room.playerUids.includes(user.uid)) throw new Error('You are not in this room.');

      // Rate limit check
      const rateRef = db.collection('rateLimits').doc(`${user.uid}-${roomId}`);
      const rateDoc = await tx.get(rateRef);

      // Apply move through the game engine
      const gameModule = require(`../shared/games`);
      const engineModule = require(`../src/engines/index`);
      const game = gameModule.getGame(room.gameId);
      if (!game) throw new Error('Unknown game.');

      const players = room.playerUids.map(uid => ({ uid, name: room.playerNames?.[uid] || 'Player' }));
      const newState = engineModule.applyGameAction(game, room.state, user.uid, action, players);

      tx.update(roomRef, {
        state: newState,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { state: newState };
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message, code: error.code || 'move-error' });
  }
};