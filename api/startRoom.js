const { getDb, verifyToken } = require('./_backend');
const admin = require('firebase-admin');

module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const db = getDb();
    const { roomId } = req.body;

    const roomRef = db.collection('rooms').doc(roomId);
    const roomDoc = await roomRef.get();
    if (!roomDoc.exists) return res.status(404).json({ error: 'Room not found.' });

    const room = roomDoc.data();
    if (room.hostUid !== user.uid) return res.status(403).json({ error: 'Only the host can start.' });
    if (room.playerUids.length < 2) return res.status(400).json({ error: 'Need at least 2 players.' });
    if (room.status !== 'waiting') return res.status(400).json({ error: 'Room already started.' });

    // Create initial game state
    const gameModule = require('../shared/games');
    const engineModule = require('../src/engines/index');
    const game = gameModule.getGame(room.gameId);
    if (!game) return res.status(400).json({ error: 'Unknown game.' });

    const players = room.playerUids.map(uid => ({ uid, name: room.playerNames?.[uid] || 'Player' }));
    const seed = `${roomId}:${Date.now()}`;
    let initialState;
    try {
      initialState = engineModule.createInitialGameState(game, players, seed);
    } catch {
      initialState = engineModule.createInitialGameState(game, players, seed);
    }

    await roomRef.update({
      status: 'playing',
      state: initialState,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};