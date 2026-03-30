/**
 * Wrap a promise with a timeout. Rejects if the promise does not resolve in time.
 *
 * @param {Promise} promise - The promise to wrap
 * @param {number} ms - Timeout in milliseconds
 * @param {string} moduleName - Module name for error message
 * @returns {Promise} Resolves with promise result or rejects with timeout error
 */
export function withTimeout(promise, ms, moduleName) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`${moduleName} timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}
