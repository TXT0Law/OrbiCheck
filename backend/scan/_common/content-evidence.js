import * as cheerio from 'cheerio';

import { err } from './result.js';

const HTTP_OK_FLOOR = 200;
const HTTP_OK_CEILING = 300;
const LOGIN_PATH = /\/(?:login|signin|sign-in)(?:\/|$)/i;

// Reject only directly observable barriers. Ordinary pages mentioning login
// or security, and normal content redirects, remain analyzable.
export function contentEvidenceError(response, requestedUrl, durationMs = 0) {
  const status = response?.status;
  if (!Number.isInteger(status) || status < HTTP_OK_FLOOR || status >= HTTP_OK_CEILING) {
    return err(Number.isInteger(status)
      ? `Content unavailable: HTTP ${status}`
      : 'Content unavailable: no valid HTTP response status', durationMs, { statusCode: 200 });
  }
  if (typeof response.data !== 'string') {
    return err('Content unavailable: response body is not text', durationMs, { statusCode: 200 });
  }
  const html = response.data;
  const $ = cheerio.load(html);
  if (response.headers?.['cf-mitigated'] === 'challenge'
      || $('script[src*="/orchestrate/chl_page/"]').length > 0) {
    return err('Content unavailable: access challenge', durationMs, { statusCode: 200 });
  }
  const finalUrl = response.request?.res?.responseUrl || response.request?.responseURL;
  if (finalUrl && finalUrl !== requestedUrl) {
    try {
      if (LOGIN_PATH.test(new URL(finalUrl).pathname) && $('input[type="password"]').length > 0) {
        return err('Content unavailable: redirected to login', durationMs, { statusCode: 200 });
      }
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      return err('Content unavailable: invalid final response URL', durationMs, { statusCode: 200 });
    }
  }
  return null;
}
