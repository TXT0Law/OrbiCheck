import https from 'https';

import middleware from './_common/middleware.js';
import { targetAddressFromRequest } from './_common/url-safety.js';

const HSTS_PRELOAD_MIN_MAX_AGE = 10886400; // 18 weeks in seconds (per hstspreload.org)
const REQUEST_TIMEOUT_MS = parseInt(process.env.HSTS_TIMEOUT_MS || '10000', 10);
const USER_AGENT = 'OrbiCheck-Scanner/1.0';

const ensureHttps = (rawUrl) => {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'https:') return parsed.toString();
    parsed.protocol = 'https:';
    return parsed.toString();
  } catch (_err) {
    return `https://${rawUrl.replace(/^https?:\/\//i, '')}`;
  }
};

const buildErrorPayload = (message, statusCode = 500) => ({
  statusCode,
  body: { error: message },
});

const NO_HEADER_PAYLOAD = {
  enabled: false,
  preloadReady: false,
  maxAge: 0,
  includeSubDomains: false,
  preload: false,
  hstsHeader: null,
  message: 'Site does not serve any HSTS headers.',
};

const parseHstsHeader = (rawHeader) => {
  const hstsHeader = rawHeader || null;
  if (!hstsHeader) {
    return NO_HEADER_PAYLOAD;
  }

  const maxAgeMatch = hstsHeader.match(/max-age\s*=\s*"?(\d+)"?/i);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
  const lowerHeader = hstsHeader.toLowerCase();
  const includeSubDomains = /\bincludesubdomains\b/.test(lowerHeader);
  const preload = /\bpreload\b/.test(lowerHeader);
  const enabled = maxAge > 0;
  const preloadReady = enabled
    && maxAge >= HSTS_PRELOAD_MIN_MAX_AGE
    && includeSubDomains
    && preload;

  let message;
  if (preloadReady) {
    message = 'Site is compatible with the HSTS preload list!';
  } else if (!enabled) {
    message = 'HSTS max-age is zero or missing.';
  } else if (maxAge < HSTS_PRELOAD_MIN_MAX_AGE) {
    message = `HSTS max-age is less than ${HSTS_PRELOAD_MIN_MAX_AGE}.`;
  } else if (!includeSubDomains) {
    message = 'HSTS header does not include all subdomains.';
  } else {
    message = 'HSTS header does not contain the preload directive.';
  }

  return {
    enabled,
    preloadReady,
    maxAge,
    includeSubDomains,
    preload,
    hstsHeader,
    message,
  };
};

const requestOnce = (url, method, pinnedAddress) => new Promise((resolve) => {
  let settled = false;
  const finish = (payload) => {
    if (!settled) {
      settled = true;
      resolve(payload);
    }
  };

  const req = https.request(
    url,
    {
      method,
      headers: { 'User-Agent': USER_AGENT },
      timeout: REQUEST_TIMEOUT_MS,
      lookup: pinnedAddress
        ? (_hostname, _options, callback) => callback(
          null,
          pinnedAddress,
          pinnedAddress.includes(':') ? 6 : 4,
        )
        : undefined,
    },
    (res) => {
      const hstsHeader = res.headers['strict-transport-security'] || null;
      // Drain the response so the socket can close even when we ignore the body.
      res.resume();
      finish({ kind: 'response', statusCode: res.statusCode || 0, hstsHeader });
    },
  );

  req.on('timeout', () => {
    req.destroy();
    finish({ kind: 'timeout' });
  });

  req.on('error', (error) => {
    finish({ kind: 'error', error });
  });

  req.end();
});

/**
 * Scan module: report HSTS posture (header presence, max-age,
 * includeSubDomains, preload eligibility).
 *
 * @param {string} rawUrl Normalised target URL.
 * @returns {Promise<{enabled?: boolean, preloadReady?: boolean,
 *   maxAge?: number, includeSubDomains?: boolean, error?: string}>}
 */
const hstsHandler = async (rawUrl, request) => {
  const url = ensureHttps(rawUrl);
  const hostname = new URL(url).hostname;
  const pinnedAddress = targetAddressFromRequest(request, hostname);
  let outcome = await requestOnce(url, 'HEAD', pinnedAddress);

  // Some origins reject HEAD with 405/501; retry with GET so that we can still
  // inspect response headers without breaking the module on those edge cases.
  if (outcome.kind === 'response' && (outcome.statusCode === 405 || outcome.statusCode === 501)) {
    outcome = await requestOnce(url, 'GET', pinnedAddress);
  }

  if (outcome.kind === 'timeout') {
    return buildErrorPayload(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`, 408);
  }
  if (outcome.kind === 'error') {
    return buildErrorPayload(`Error making request: ${outcome.error.message}`);
  }
  return parseHstsHeader(outcome.hstsHeader);
};

export const handler = middleware(hstsHandler);
export default handler;
