/**
 * batchProcessor — queue management with controlled concurrency.
 * Maximum 4 labels in flight; results stream to the caller as each
 * completes so the UI never waits for the full batch.
 */

export const BATCH_CONCURRENCY = 4;

/**
 * Process items with a fixed-size worker pool.
 * @param {Array} items
 * @param {(item, index) => Promise} handler
 * @param {object} [opts]
 * @param {number} [opts.concurrency]
 * @param {(done, total) => void} [opts.onProgress]
 * @param {() => boolean} [opts.isCancelled]
 */
export async function processWithConcurrency(items, handler, opts = {}) {
  const { concurrency = BATCH_CONCURRENCY, onProgress = () => {}, isCancelled = () => false } = opts;
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < items.length && !isCancelled()) {
      const index = next++;
      try {
        await handler(items[index], index);
      } finally {
        done += 1;
        onProgress(done, items.length);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}
