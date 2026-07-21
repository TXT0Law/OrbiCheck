import { httpWith } from './_common/http.js';
import middleware from './_common/middleware.js';

const PAGE_SOURCE_TIMEOUT_MS = 30000;

const MAX_HTML_LENGTH = 2 * 1024 * 1024; // 2MB limit
const pageSourceHttp = httpWith({
  timeout: PAGE_SOURCE_TIMEOUT_MS,
  maxContentLength: MAX_HTML_LENGTH,
  orbicheckRejectUnauthorized: false,
});

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/120.0.0.0 Safari/537.36';

/**
 * Scan module: fetch the raw HTML page source. Tolerates broken SSL
 * (`rejectUnauthorized: false`) because OSINT must work on misconfigured
 * sites — see http.js technical exemptions list.
 *
 * @param {string} url Normalised target URL.
 * @returns {Promise<{html?: string, statusCode?: number, error?: string}>}
 */
const pageSourceHandler = async (url) => {
  const startTime = Date.now();

  if (!url) {
    return {
      success: false,
      html: '',
      statusCode: null,
      contentType: '',
      contentLength: 0,
      truncated: false,
      error: 'URL is missing',
      duration_ms: Date.now() - startTime,
    };
  }

  try {
    const response = await pageSourceHttp.get(url, {
      responseType: 'text',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const rawData = typeof response.data === 'string' ? response.data : '';
    const html = rawData.slice(0, MAX_HTML_LENGTH);
    const contentType = response.headers['content-type'] || '';
    const contentLength = html.length;
    const truncated = rawData.length > MAX_HTML_LENGTH;

    return {
      success: true,
      html,
      statusCode: response.status,
      contentType,
      contentLength,
      truncated,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      html: '',
      statusCode: null,
      contentType: '',
      contentLength: 0,
      truncated: false,
      error: errMsg,
      duration_ms: Date.now() - startTime,
    };
  }
};

export const handler = middleware(pageSourceHandler);
export default handler;
