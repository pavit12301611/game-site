const { getDb, verifyToken, getAuth } = require('./_backend');
module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const db = getDb();
    const uid = user.uid;
    let friendships = 0, invites = 0, rooms = 0;

    // Delete friendships
    const fSnap = await db.collection('friendships').where('members', 'array-contains', uid).get();
    for (const doc of fSnap.docs) { await doc.ref.delete(); friendships++; }

    // Delete friend requests
    const rSnap = await db.collection('friendRequests').where('fromUid', '==', uid).get();
    for (const doc of rSnap.docs) await doc.ref.delete();
    const rSnap2 = await db.collection('friendRequests').where('toUid', '==', uid).get();
    for (const doc of rSnap2.docs) await doc.ref.delete();

    // Delete invites
    const iSnap = await db.collection('gameInvites').where('toUid', '==', uid).get();
    for (const doc of iSnap.docs) { await doc.ref.delete(); invites++; }

    // Remove from rooms
    const roomSnap = await db.collection('rooms').where('playerUids', 'array-contains', uid).get();
    for (const doc of roomSnap.docs) { await doc.ref.delete(); rooms++; }

    // Delete profile, username, blocks, presence
    await db.collection('profiles').doc(uid).delete().catch(() => {});
    const profile = await db.collection('profiles').doc(uid).get().catch(() => null);
    if (profile?.data()?.usernameLower) await db.collection('usernames').doc(profile.data().usernameLower).delete().catch(() => {});
    await db.collection('admins').doc(uid).delete().catch(() => {});

    // Delete Firebase Auth user
    try { await getAuth().deleteUser(uid); } catch { /* ignore */ }

    res.json({ ok: true, friendships, invites, rooms });
  } catch (error) { res.status(400).json({ error: error.message }); }
};