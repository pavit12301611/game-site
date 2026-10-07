const { getDb, verifyToken } = require('./_backend');
module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const db = getDb();
    const roomRef = db.collection('rooms').doc(req.body.roomId);
    const roomDoc = await roomRef.get();
    if (!roomDoc.exists) return res.status(404).json({ error: 'Room not found.' });
    const room = roomDoc.data();
    if (room.hostUid !== user.uid) return res.status(403).json({ error: 'Only the host can rematch.' });

    const gameModule = require('../shared/games');
    const engineModule = require('../src/engines/index');
    const game = gameModule.getGame(room.gameId);
    const players = room.playerUids.map(uid => ({ uid, name: room.playerNames?.[uid] || 'Player' }));
    const newState = engineModule.createInitialGameState(game, players, `${req.body.roomId}:rematch:${Date.now()}`);

    await roomRef.update({ status: 'playing', state: newState, updatedAt: require('firebase-admin').firestore.FieldValue.serverTimestamp() });
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
};