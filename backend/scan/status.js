// Scan module: probe target URL with HEAD (falling back to GET if HEAD is
// disallowed) and report HTTP status, response time, and observed
// `Server` header.
//
// History:
//   - Pre S-3 (middleReport.md): hand-rolled `https.get` only.  Could not
//     probe http://, had no User-Agent, would `throw` on 4xx/5xx which
//     cost the entire module timeout (~30 s) via middleware bubbling.
//   - S-3: switch to the shared `_common/http.js` axios instance so we
//     pick up timeouts, circuit-breaker, retry policy (off for 5xx since
//     S-2), and standardised User-Agent. Module now also supports both
//     http:// and https:// inputs.

import { performance } from 'perf_hooks';

import { http, HTTP_DEFAULT_TIMEOUT_MS } from './_common/http.js';
import middleware from './_common/middleware.js';
import { err, ok } from './_common/result.js';

const PROBE_TIMEOUT_MS = parseInt(
  process.env.MODULE_STATUS_PROBE_TIMEOUT_MS || `${HTTP_DEFAULT_TIMEOUT_MS}`,
  10,
);
const STATUS_UP_FLOOR = 200;
const STATUS_UP_CEILING = 400;
const MAX_REDIRECTS = 3;

function isUpStatus(status) {
  return Number.isFinite(status) && status >= STATUS_UP_FLOOR && status < STATUS_UP_CEILING;
}

async function probe(url, method) {
  const startedAt = performance.now();
  const response = await http.request({
    url,
    method,
    timeout: PROBE_TIMEOUT_MS,
    maxRedirects: MAX_REDIRECTS,
  });
  const responseTime = performance.now() - startedAt;
  return { response, responseTime };
}

/**
 * Probe a URL with HEAD; fall back to GET when the server replies 405 or
 * 501 (some hosts disallow HEAD even for uptime probes).
 */
async function probeWithFallback(url) {
  const head = await probe(url, 'HEAD');
  if (head.response.status === 405 || head.response.status === 501) {
    return probe(url, 'GET');
  }
  return head;
}

/**
 * Scan module: lightweight uptime probe for the target URL.
 *
 * @param {string} url Normalised target URL (middleware injects http/https).
 * @returns {Promise<object>}
 */
const statusHandler = async (url) => {
  if (!url) {
    return err('Missing required URL', 0, { statusCode: 400 });
  }

  try {
    const { response, responseTime } = await probeWithFallback(url);
    const responseCode = response?.status ?? 0;
    const serverHeader = response?.headers?.server || null;
    const data = {
      isUp: isUpStatus(responseCode),
      responseCode,
      responseTime: Math.round(responseTime),
      server: serverHeader,
    };
    if (!data.isUp) {
      return err(
        `Received non-success response code: ${responseCode}`,
        Math.round(responseTime),
        { statusCode: 200, data },
      );
    }
    return ok(data, responseTime);
  } catch (error) {
    // Network-level errors (DNS, refused, TLS) — surface a clean envelope
    // so the batch runner doesn't have to deal with raw axios shapes.
    return err(
      error?.code === 'CIRCUIT_OPEN'
        ? 'Target temporarily skipped by circuit breaker'
        : `Probe failed: ${error?.message || 'unknown error'}`,
      0,
      { statusCode: 200 },
    );
  }
};

export const handler = middleware(statusHandler);
export default handler;
