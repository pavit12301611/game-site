/**
 * Review agent: dependency-free sentiment prediction, fallback logic, automatic reply
 * templates, and evidence-counted ideas. Shared between browser (web worker) and backend.
 */

const POSITIVE_WORDS = ['great', 'love', 'awesome', 'fun', 'amazing', 'excellent', 'perfect', 'fantastic', 'enjoy', 'best', 'cool', 'nice', 'brilliant', 'superb', 'wonderful'];
const NEGATIVE_WORDS = ['bad', 'hate', 'boring', 'terrible', 'awful', 'worst', 'bug', 'broken', 'lag', 'crash', 'annoying', 'slow', 'ugly', 'waste', 'poor'];

/**
 * Fallback sentiment prediction when the ML model is unavailable.
 * @param {string} text
 * @returns {{ label: 'positive'|'neutral'|'negative', confidence: number }}
 */
export function fallbackSentiment(text) {
  const lower = String(text || '').toLowerCase();
  let score = 0;
  for (const word of POSITIVE_WORDS) if (lower.includes(word)) score++;
  for (const word of NEGATIVE_WORDS) if (lower.includes(word)) score--;
  if (score > 0) return { label: 'positive', confidence: Math.min(0.9, 0.5 + score * 0.1) };
  if (score < 0) return { label: 'negative', confidence: Math.min(0.9, 0.5 + Math.abs(score) * 0.1) };
  return { label: 'neutral', confidence: 0.4 };
}

/**
 * Automatic reply template based on sentiment and content.
 * @param {{ label: string }} sentiment
 * @param {string} message
 * @param {string} gameTitle
 * @returns {string}
 */
export function generateReply(sentiment, message, gameTitle) {
  const positive = [
    `Glad you enjoy ${gameTitle}! The neon boards are a labour of love.`,
    `Thanks for the kind words — we smile every time someone picks ${gameTitle}.`,
    `Appreciate it! ${gameTitle} is one of our favourites too.`,
  ];
  const negative = [
    `Sorry to hear that. We are always tweaking ${gameTitle} — feedback helps.`,
    `Thanks for being honest. We will keep improving ${gameTitle}.`,
    `That is fair. We are working on making ${gameTitle} better with every update.`,
  ];
  const neutral = [
    `Thanks for playing ${gameTitle} and sharing your thoughts!`,
    `Every review helps. Thanks for taking the time on ${gameTitle}.`,
    `Noted! We read every review for ${gameTitle}.`,
  ];
  const pool = sentiment.label === 'positive' ? positive : sentiment.label === 'negative' ? negative : neutral;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Validates a review submission.
 * @param {{ rating: number, message: string, gameId: string }} review
 * @returns {{ ok: boolean, reason: string }}
 */
export function validateReview(review) {
  if (!review.message || review.message.trim().length < 10) return { ok: false, reason: 'Reviews must be at least 10 characters.' };
  if (review.message.length > 1000) return { ok: false, reason: 'Reviews must be under 1000 characters.' };
  if (!review.rating || review.rating < 1 || review.rating > 5) return { ok: false, reason: 'Rating must be between 1 and 5.' };
  return { ok: true, reason: '' };
}