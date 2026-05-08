/**
 * Wrap a promise with a timeout. Rejects if the promise does not resolve in time.
 *
 * Internally uses `.finally(clearTimeout)` so that fast-resolving promises do
 * not leave a dangling `setTimeout` handle in the event loop until the timeout
 * naturally elapses. Without this Jest reports "Force exiting" because each
 * fast-resolving module would otherwise keep the loop alive for the full
 * timeout window.
 *
 * @param {Promise} promise - The promise to wrap
 * @param {number} ms - Timeout in milliseconds
 * @param {string} moduleName - Module name for error message
 * @returns {Promise} Resolves with promise result or rejects with timeout error
 */
export function withTimeout(promise, ms, moduleName) {
  let timer;
  const timeoutPromise = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${moduleName} timed out after ${ms}ms`);
      error.code = 'WITH_TIMEOUT';
      reject(error);
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}
