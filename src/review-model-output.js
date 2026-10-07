/**
 * Adapter that maps raw model output (logits) to a sentiment label.
 */

/**
 * Maps raw model logits to a sentiment label.
 * @param {number[]} logits  array of 3 values: [negative, neutral, positive]
 * @returns {{ label: 'negative'|'neutral'|'positive', confidence: number }}
 */
export function mapModelOutput(logits) {
  if (!Array.isArray(logits) || logits.length < 3) {
    return { label: 'neutral', confidence: 0.5 };
  }

  const exps = logits.map(x => Math.exp(x));
  const sum = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map(x => x / sum);

  const maxIdx = probs.indexOf(Math.max(...probs));
  const labels = ['negative', 'neutral', 'positive'];

  return {
    label: labels[maxIdx] || 'neutral',
    confidence: probs[maxIdx] || 0.5,
  };
}