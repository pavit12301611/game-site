const { getDb, verifyToken } = require('./_backend');
const admin = require('firebase-admin');
module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const db = getDb();
    const adminDoc = await db.collection('admins').doc(user.uid).get();
    if (!adminDoc.exists || !adminDoc.data()?.admin) return res.status(403).json({ error: 'Admin access required.' });
    const { action, roomId, uid, friendshipId, requestId, inviteId } = req.body;
    if (action === 'delete' && roomId) { await db.collection('rooms').doc(roomId).delete(); }
    else if (action === 'kick' && roomId && uid) {
      await db.collection('rooms').doc(roomId).update({ playerUids: admin.firestore.FieldValue.arrayRemove(uid), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    else if (action === 'deleteFriendship' && friendshipId) { await db.collection('friendships').doc(friendshipId).delete(); }
    else if (action === 'deleteRequest' && requestId) { await db.collection('friendRequests').doc(requestId).delete(); }
    else if (action === 'deleteInvite' && inviteId) { await db.collection('gameInvites').doc(inviteId).delete(); }
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ error: error.message }); }
};