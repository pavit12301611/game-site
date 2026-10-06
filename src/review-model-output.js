import {
  ON_DEVICE_REVIEW_MODEL_ID,
  ON_DEVICE_REVIEW_MODEL_REVISION,
} from '../shared/reviews/agent.js';

/**
 * Convert the model's two-class probability list into a small, validated value that can be sent to
 * the review callable. The model itself only knows positive/negative; low-confidence output is left
 * for the rating and the transparent local fallback to interpret.
 * @param {unknown} output
 */
export function interpretReviewModelOutput(output) {
  const entries = Array.isArray(output) && Array.isArray(output[0]) ? output[0] : output;
  if (!Array.isArray(entries)) throw new Error('The on-device review model returned no class scores.');
  const scores = new Map(entries.map((entry) => [
    String(entry?.label || '').trim().toLowerCase(),
    Number(entry?.score),
  ]));
  const positive = Number(scores.get('positive'));
  const negative = Number(scores.get('negative'));
  if (!Number.isFinite(positive) || !Number.isFinite(negative)) {
    throw new Error('The on-device review model returned unexpected class labels.');
  }
  const confidence = Math.max(positive, negative);
  const margin = Math.abs(positive - negative);
  const sentiment = confidence >= 0.65 && margin >= 0.3
    ? (positive > negative ? 'positive' : 'negative')
    : 'neutral';
  return {
    modelId: ON_DEVICE_REVIEW_MODEL_ID,
    revision: ON_DEVICE_REVIEW_MODEL_REVISION,
    sentiment,
    confidence: Number(confidence.toFixed(4)),
  };
}
