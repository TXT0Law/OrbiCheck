import { http } from './_common/http.js';
import middleware from './_common/middleware.js';
import { normalizeUrl } from './_common/url.js';

// WebsiteCarbon's free tier rate-limits aggressively, so keep one shared
// timeout knob for both the HTML fetch and the API call.
const CARBON_REQUEST_TIMEOUT_MS = parseInt(
  process.env.CARBON_REQUEST_TIMEOUT_MS || '10000',
  10,
);

const carbonHandler = async (rawUrl) => {
  // Follow-up to P0-6 / P2: middleware already normalises the inbound URL,
  // but be defensive in case carbon.js is ever invoked through a code path
  // that bypasses the middleware (e.g. unit tests). Without this, a bare
  // `http://example.com` would have triggered `ERR_INVALID_PROTOCOL` from
  // `https.request` in the previous implementation.
  const url = normalizeUrl(rawUrl) || rawUrl;

  try {
    const pageResponse = await http.get(url, {
      timeout: CARBON_REQUEST_TIMEOUT_MS,
      // Ask for raw bytes so the size estimate matches what the browser
      // would actually download.
      responseType: 'arraybuffer',
    });
    if (pageResponse.status >= 400) {
      throw new Error(`Page fetch returned HTTP ${pageResponse.status}`);
    }
    const sizeInBytes = Buffer.byteLength(pageResponse.data);

    const apiUrl = `https://api.websitecarbon.com/data?bytes=${sizeInBytes}&green=0`;
    const apiResponse = await http.get(apiUrl, {
      timeout: CARBON_REQUEST_TIMEOUT_MS,
    });
    if (apiResponse.status >= 400) {
      throw new Error(`WebsiteCarbon API returned HTTP ${apiResponse.status}`);
    }

    let carbonData = apiResponse.data;
    if (typeof carbonData === 'string') {
      const trimmed = carbonData.trim();
      // Cloudflare challenge / WAF block-page detection: bail before JSON
      // parse so the operator sees a meaningful error instead of a SyntaxError.
      if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<')) {
        throw new Error(
          'WebsiteCarbon API returned HTML instead of JSON. This may be due to '
          + 'Cloudflare protection when running from a datacenter IP.',
        );
      }
      try {
        carbonData = JSON.parse(carbonData);
      } catch (parseError) {
        throw new Error(
          `Failed to parse WebsiteCarbon API response as JSON: ${parseError.message}`,
          { cause: parseError },
        );
      }
    }

    if (
      !carbonData
      || !carbonData.statistics
      || (carbonData.statistics.adjustedBytes === 0 && carbonData.statistics.energy === 0)
    ) {
      // Plain envelope-friendly object — no more Netlify `{ statusCode, body }`
      // stringified shape. `normaliseEnvelope` previously had to JSON.parse
      // this back out which was wasted work.
      return { skipped: 'Not enough info to get carbon data' };
    }

    carbonData.scanUrl = url;
    return carbonData;
  } catch (error) {
    // P2-8: preserve the underlying error so the structured logger can
    // report the original network/parse failure instead of an opaque
    // "Error: <message>" string.
    throw new Error(`Carbon footprint check failed: ${error.message}`, { cause: error });
  }
};

export const handler = middleware(carbonHandler);
export default handler;
