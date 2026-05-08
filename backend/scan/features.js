import https from 'https';

import middleware from './_common/middleware.js';

// P2-9: BuiltWith's Free API (`free1`) only supports query-parameter auth via
// `?KEY=<apikey>` — there is no header alternative. That means the API key is
// embedded in the request URL. Mitigations applied here:
//   1. The URL is constructed locally and passed straight to `https.get`; we
//      never log it, never put it in an Error message, and never echo it in
//      the response body.
//   2. `redactApiKey()` strips the key from any error string before it
//      crosses a module / log boundary, so even if upstream tooling
//      accidentally captures the URL we will not leak the credential.
//   3. The frontend / structured logger should treat the entire `apiUrl` as
//      a secret. The middleware envelope produced by this handler does not
//      include it.

const BUILTWITH_API_HOST = 'api.builtwith.com';
const BUILTWITH_FREE_API_PATH = '/free1/api.json';

function redactApiKey(value, apiKey) {
  if (!apiKey || typeof value !== 'string') return value;
  // Defence in depth: also redact URL-encoded variants if upstream wrappers
  // round-trip the key through encodeURIComponent.
  const encoded = encodeURIComponent(apiKey);
  return value
    .split(apiKey).join('***REDACTED***')
    .split(encoded).join('***REDACTED***');
}

/**
 * Scan module: query BuiltWith Free API for technology features used by
 * the target. The API key is auto-redacted from any returned error
 * message (P2-9).
 *
 * @param {string} url Normalised target URL.
 * @returns {Promise<object>} BuiltWith payload, `{error}`, or `{skipped}`.
 */
const featuresHandler = async (url) => {
  const startTime = Date.now();
  const apiKey = process.env.BUILT_WITH_API_KEY;

  if (!url) {
    return {
      success: false,
      data: { Results: [], features: [] },
      error: 'URL query parameter is required',
      duration_ms: Date.now() - startTime,
    };
  }

  if (!apiKey) {
    return {
      success: true,
      Results: [],
      features: [],
      data: {
        Results: [],
        features: [],
        note: 'BuiltWith API key not configured. Set BUILT_WITH_API_KEY in .env (see .env.example). Features fall back to tech-stack when available.',
      },
      duration_ms: Date.now() - startTime,
    };
  }

  const apiUrl = `https://${BUILTWITH_API_HOST}${BUILTWITH_FREE_API_PATH}`
    + `?KEY=${apiKey}&LOOKUP=${encodeURIComponent(url)}`;

  try {
    const response = await new Promise((resolve, reject) => {
      const req = https.get(apiUrl, res => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode <= 299) {
            resolve(data);
          } else {
            // Status-only error: never include the URL/key.
            reject(new Error(`BuiltWith API returned status ${res.statusCode}`));
          }
        });
      });

      req.on('error', error => {
        // Wrap to ensure the key cannot leak via error.message even if
        // Node ever decides to embed the URL in network errors.
        const sanitisedMessage = redactApiKey(error.message || 'Network error', apiKey);
        reject(new Error(sanitisedMessage));
      });

      req.end();
    });

    if (typeof response !== 'string') {
      return response;
    }

    const parsed = JSON.parse(response);
    return {
      success: true,
      ...parsed,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      data: { Results: [], features: [] },
      error: redactApiKey(error.message || 'Feature detection failed', apiKey),
      duration_ms: Date.now() - startTime,
    };
  }
};

/** @internal Exported for testing. */
export { redactApiKey };

export const handler = middleware(featuresHandler);
export default handler;
