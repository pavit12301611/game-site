const { getDb, verifyToken } = require('./_backend');
const admin = require('firebase-admin');
module.exports = async (req, res) => {
  try {
    const user = await verifyToken(req);
    const db = getDb();
    const { rating, gameId, title, message, reviewerName } = req.body;
    if (!message || message.length < 10) return res.status(400).json({ error: 'Reviews must be at least 10 characters.' });
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5.' });

    // Fallback sentiment
    const { fallbackSentiment, generateReply } = require('../shared/reviews/agent');
    const sentiment = fallbackSentiment(message);
    const reply = generateReply(sentiment, message, gameId || 'the arcade');

    const ref = await db.collection('reviews').add({
      uid: user.uid, rating, gameId, title, message, reviewerName: reviewerName || 'Anonymous',
      sentiment: sentiment.label, approved: true, featured: false,
      reply: { message: reply, assistantName: 'Arcade Review Agent', createdAt: admin.firestore.FieldValue.serverTimestamp() },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ reviewId: ref.id, assistantName: 'Arcade Review Agent', usedOnDeviceModel: false, modelUnavailable: false });
  } catch (error) { res.status(400).json({ error: error.message }); }
};