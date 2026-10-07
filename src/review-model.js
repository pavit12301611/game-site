/**
 * On-device sentiment analysis using a web worker.
 * The quantized DistilBERT model downloads on first use and is cached by the browser.
 */

let worker = null;

/**
 * Gets or creates the sentiment analysis worker.
 */
function getWorker() {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./review-model.worker.js', import.meta.url), { type: 'module' });
    return worker;
  } catch {
    return null;
  }
}

/**
 * Classifies sentiment using the on-device model.
 * @param {string} text
 * @param {(status: string) => void} onStatus
 * @returns {Promise<{ label: string, confidence: number, source: string }>}
 */
export function classifySentiment(text, onStatus) {
  const w = getWorker();
  if (!w) {
    return Promise.resolve({ label: 'neutral', confidence: 0.5, source: 'fallback' });
  }

  return new Promise((resolve) => {
    const handler = (event) => {
      if (event.data?.type === 'status') {
        onStatus?.(event.data.message);
        return;
      }
      if (event.data?.type === 'result') {
        w.removeEventListener('message', handler);
        resolve({
          label: event.data.label || 'neutral',
          confidence: event.data.confidence || 0.5,
          source: 'model',
        });
      }
    };
    w.addEventListener('message', handler);
    w.postMessage({ type: 'classify', text });
  });
}