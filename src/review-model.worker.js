import { pipeline, env } from '@huggingface/transformers';
import {
  ON_DEVICE_REVIEW_MODEL_ID,
  ON_DEVICE_REVIEW_MODEL_REVISION,
} from '../shared/reviews/agent.js';
import { interpretReviewModelOutput } from './review-model-output.js';

const workerScope = /** @type {any} */ (globalThis);
/** @type {Promise<any> | null} */
let classifierPromise = null;

function progressDescription(info) {
  if (info?.status === 'progress_total' && Number.isFinite(Number(info.progress))) {
    return `Downloading the on-device model · ${Math.round(Number(info.progress))}%`;
  }
  if (info?.status === 'progress' && Number(info.total) > 0) {
    const percent = Math.round((Number(info.loaded) / Number(info.total)) * 100);
    return `Downloading the on-device model · ${Math.max(0, Math.min(100, percent))}%`;
  }
  if (info?.status === 'done') return 'Preparing the on-device model…';
  return '';
}

async function loadClassifier(activeRequestId) {
  if (!classifierPromise) {
    // Transformers.js stores downloaded model files in the browser Cache API by default. The
    // committed revision makes the public weights reproducible and no review text is fetched.
    env.useBrowserCache = true;
    classifierPromise = pipeline('text-classification', ON_DEVICE_REVIEW_MODEL_ID, {
      revision: ON_DEVICE_REVIEW_MODEL_REVISION,
      dtype: 'q8',
      progress_callback(info) {
        const text = progressDescription(info);
        if (text) workerScope.postMessage({ type: 'progress', requestId: activeRequestId, text });
      },
    }).catch((error) => {
      classifierPromise = null;
      throw error;
    });
  }
  return classifierPromise;
}

workerScope.addEventListener('message', async (event) => {
  const message = event.data;
  if (message?.type !== 'classify' || !Number.isInteger(message.requestId)) return;
  try {
    const classifier = await loadClassifier(message.requestId);
    workerScope.postMessage({
      type: 'progress',
      requestId: message.requestId,
      text: 'Running sentiment analysis on this device…',
    });
    const output = await classifier(String(message.text || ''), { top_k: null });
    const prediction = interpretReviewModelOutput(output);
    workerScope.postMessage({ type: 'result', requestId: message.requestId, prediction });
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      requestId: message.requestId,
      message: error instanceof Error ? error.message : 'The on-device review model could not load.',
    });
  }
});
