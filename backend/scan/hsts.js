import https from 'https';
import middleware from './_common/middleware.js';

const HSTS_PRELOAD_MIN_MAX_AGE = 10886400; // 18 weeks in seconds (per hstspreload.org)
const REQUEST_TIMEOUT_MS = 10000;
const USER_AGENT = 'OrbiCheck-Scanner/1.0';

const hstsHandler = async (url) => {
  const errorResponse = (message, statusCode = 500) => ({
    statusCode,
    body: JSON.stringify({ error: message }),
  });

  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD', headers: { 'User-Agent': USER_AGENT }, timeout: REQUEST_TIMEOUT_MS }, (res) => {
      const headers = res.headers;
      const hstsHeader = headers['strict-transport-security'] || null;

      if (!hstsHeader) {
        resolve({
          enabled: false,
          preloadReady: false,
          maxAge: 0,
          includeSubDomains: false,
          preload: false,
          hstsHeader: null,
          message: 'Site does not serve any HSTS headers.',
        });
        return;
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

      resolve({
        enabled,
        preloadReady,
        maxAge,
        includeSubDomains,
        preload,
        hstsHeader,
        message,
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });

    req.on('error', (error) => {
      resolve(errorResponse(`Error making request: ${error.message}`));
    });

    req.end();
  });
};

export const handler = middleware(hstsHandler);
export default handler;
