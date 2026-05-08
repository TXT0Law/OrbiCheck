// trace-route.js is intentionally NOT registered in registry.js (P1-9).
// Kept on disk so a future agent can swap in an `execFile('mtr', ...)` /
// `traceroute` implementation without re-introducing the file.

import url from 'url';

import middleware from './_common/middleware.js';

const SAFE_HOSTNAME_PATTERN = /^[a-zA-Z0-9.-]+$/;

/**
 * Scan module: traceroute / mtr placeholder. NOT registered in
 * `registry.js` per P1-9; the file is kept so a future agent can drop in
 * an `execFile('mtr', ['--report', ...])` implementation without
 * re-creating the file. Always returns a `disabled` payload today.
 *
 * @param {string} urlString Normalised target URL.
 * @returns {Promise<{message: string, result: any[], warning: string}>}
 */
const traceRouteHandler = async (urlString) => {
  const urlObject = url.parse(urlString);
  const host = urlObject.hostname;

  if (!host) {
    throw new Error('Invalid URL provided');
  }

  if (!SAFE_HOSTNAME_PATTERN.test(host)) {
    throw new Error('Invalid hostname');
  }

  if (process.platform === 'win32') {
    return {
      message: 'Traceroute skipped on Windows in local development',
      result: [],
      warning: 'Traceroute module is not stable on this platform',
    };
  }

  return {
    message: 'Traceroute is temporarily disabled pending a safe execFile-based implementation.',
    result: [],
    warning: `Traceroute disabled for host ${host}`,
  };
};

export const handler = middleware(traceRouteHandler);
export default handler;
