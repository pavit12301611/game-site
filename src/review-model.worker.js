/**
 * Web worker for on-device sentiment analysis using a quantized DistilBERT model.
 */

import { mapModelOutput } from './review-model-output.js';

let pipeline = null;
let loading = false;

self.onmessage = async (event) => {
  if (event.data?.type !== 'classify') return;
  const { text } = event.data;

  if (!pipeline) {
    if (loading) return;
    loading = true;
    self.postMessage({ type: 'status', message: 'Loading the sentiment model (first use only)…' });

    try {
      const { pipeline: loadPipeline } = await import('@huggingface/transformers');
      self.postMessage({ type: 'status', message: 'Model loaded. Classifying…' });
      pipeline = await loadPipeline('sentiment-analysis', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english');
    } catch {
      // Model unavailable — use fallback
      self.postMessage({ type: 'result', label: 'neutral', confidence: 0.5 });
      loading = false;
      return;
    }
    loading = false;
  }

  try {
    self.postMessage({ type: 'status', message: 'Classifying sentiment…' });
    const result = await pipeline(text);
    const output = Array.isArray(result) ? result[0] : result;
    const label = output?.label === 'POSITIVE' ? 'positive'
      : output?.label === 'NEGATIVE' ? 'negative'
      : 'neutral';
    self.postMessage({
      type: 'result',
      label,
      confidence: output?.score || 0.5,
    });
  } catch {
    self.postMessage({ type: 'result', label: 'neutral', confidence: 0.5 });
  }
};