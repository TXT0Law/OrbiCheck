import { http } from './_common/http.js';
import middleware from './_common/middleware.js';

/**
 * Scan module: fetch the page and return all HTTP response headers verbatim.
 *
 * @param {string} url Normalised target URL.
 * @returns {Promise<object>} Header map keyed by lowercased header name.
 */
const headersHandler = async (url) => {
  // P2-8: do NOT rewrap errors with `new Error(error.message)` (which dropped
  // stack traces). Let the original error propagate so the runner / logger
  // can surface the real cause; middleware will still produce a sanitised
  // envelope for the external caller.
  const response = await http.get(url);
  return response.headers;
};

export const handler = middleware(headersHandler);
export default handler;
