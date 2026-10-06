/** @typedef {{ type: 'progress', text: string } | { type: 'result', prediction: Record<string, any> } | { type: 'error', message: string }} ReviewModelWorkerMessage */

/** @type {Worker | null} */
let modelWorker = null;
/** @type {{ resolve: (prediction: Record<string, any>) => void, reject: (error: Error) => void, onProgress?: (message: string) => void } | null} */
let pendingInference = null;
let requestId = 0;

function stopModelWorker() {
  modelWorker?.terminate();
  modelWorker = null;
}

function settleInference(error, prediction) {
  if (!pendingInference) return;
  const pending = pendingInference;
  pendingInference = null;
  if (error) pending.reject(error);
  else pending.resolve(prediction);
}

function getModelWorker() {
  if (modelWorker) return modelWorker;
  modelWorker = new Worker(new URL('./review-model.worker.js', import.meta.url), { type: 'module' });
  modelWorker.addEventListener('message', (event) => {
    /** @type {ReviewModelWorkerMessage & { requestId?: number }} */
    const message = event.data;
    if (message.requestId !== requestId || !pendingInference) return;
    if (message.type === 'progress') pendingInference.onProgress?.(message.text);
    else if (message.type === 'result') settleInference(null, message.prediction);
    else if (message.type === 'error') settleInference(new Error(message.message));
  });
  modelWorker.addEventListener('error', (event) => {
    settleInference(new Error(event.message || 'The on-device review model could not start.'));
    stopModelWorker();
  });
  return modelWorker;
}

/** Run the quantized, pretrained transformer in a worker so model loading never blocks the form. */
export function classifyReviewOnDevice(text, onProgress) {
  if (pendingInference) return Promise.reject(new Error('The local review model is already analyzing a review.'));
  return new Promise((resolve, reject) => {
    requestId += 1;
    pendingInference = { resolve, reject, onProgress };
    try {
      getModelWorker().postMessage({ type: 'classify', requestId, text });
    } catch (error) {
      settleInference(error instanceof Error ? error : new Error(String(error)));
      stopModelWorker();
    }
  });
}
