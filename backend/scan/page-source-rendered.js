// backend/scan/page-source-rendered.js
// C-5: Rendered DOM page source via the shared Playwright pool. Returns the
// HTML serialized AFTER the SPA has had a chance to fetch and inject markup,
// which is required for monitors targeting JS-rendered widgets (changedetection.io
// "browser" fetch mode).
//
// Important guard rails:
//   * Always shares the singleton browser; never spawns a fresh chromium.
//   * Hard navigation timeout (NAV_TIMEOUT_MS) tighter than the outer
//     middleware ceiling so a slow page never starves the monitor probe.
//   * Optional `waitForSelector` / `waitForMs` from the request — bounded
//     so a malicious config cannot keep a context open indefinitely.
//   * Output truncated to MAX_HTML_LENGTH so a runaway page can't OOM the
//     scan-service.

import { withBrowserContext } from './_common/playwright-browser.js';
import middleware from './_common/middleware.js';

const NAV_TIMEOUT_MS = 18000;
const SELECTOR_TIMEOUT_MS_MAX = 10000;
const SLEEP_MS_MAX = 10000;
const MAX_HTML_LENGTH = 2 * 1024 * 1024;
const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 720;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/120.0.0.0 Safari/537.36 OrbiCheck-Monitor';

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

const renderedHandler = async (targetUrl, req) => {
  const startedAt = Date.now();
  if (!targetUrl) {
    return {
      success: false,
      data: { html: '', statusCode: null, contentType: '', contentLength: 0, truncated: false },
      error: 'URL is missing',
    };
  }

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'http://' + targetUrl;
  }

  try {
    new URL(targetUrl);
  } catch {
    return {
      success: false,
      data: { html: '', statusCode: null, contentType: '', contentLength: 0, truncated: false },
      error: 'URL provided is invalid',
    };
  }

  const q = (req && typeof req.query === 'object') ? req.query : {};
  const waitForSelector = typeof q.waitForSelector === 'string' ? q.waitForSelector : '';
  const waitMs = clampInt(q.waitForMs, 0, SLEEP_MS_MAX, 0);
  const viewportWidth = clampInt(q.viewportWidth, 320, 3840, DEFAULT_VIEWPORT_WIDTH);
  const viewportHeight = clampInt(q.viewportHeight, 240, 2160, DEFAULT_VIEWPORT_HEIGHT);

  try {
    const result = await withBrowserContext(async (_context, page) => {
      page.setDefaultTimeout(NAV_TIMEOUT_MS);
      const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      if (waitForSelector) {
        try {
          await page.waitForSelector(waitForSelector, {
            timeout: SELECTOR_TIMEOUT_MS_MAX,
            state: 'attached',
          });
        } catch (_err) {
          // The operator asked us to wait; if the selector never appears we
          // still return whatever HTML we have rather than failing the
          // capture outright. The caller can detect the missing element via
          // their selectorExtraction config and decide what to do.
        }
      }
      if (waitMs > 0) {
        await page.waitForTimeout(waitMs);
      }
      const html = await page.content();
      return { html, status: response ? response.status() : null };
    }, {
      contextOptions: {
        viewport: { width: viewportWidth, height: viewportHeight },
        ignoreHTTPSErrors: true,
        userAgent: USER_AGENT,
      },
      launchOverrides: { args: ['--ignore-certificate-errors'] },
    });

    const truncated = (result.html || '').length > MAX_HTML_LENGTH;
    const html = (result.html || '').slice(0, MAX_HTML_LENGTH);
    return {
      success: true,
      data: {
        html,
        statusCode: result.status,
        contentType: 'text/html; rendered=true',
        contentLength: html.length,
        truncated,
        capturedAt: new Date().toISOString(),
        renderMode: 'browser',
        durationMs: Date.now() - startedAt,
      },
    };
  } catch (err) {
    return {
      success: false,
      data: { html: '', statusCode: null, contentType: '', contentLength: 0, truncated: false },
      error: err?.message || 'Rendered page-source capture failed',
    };
  }
};

export const handler = middleware(renderedHandler);
export default handler;
