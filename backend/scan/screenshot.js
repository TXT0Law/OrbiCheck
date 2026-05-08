// backend/scan/screenshot.js
// Screenshot capture using Playwright (replaces Puppeteer). Uses the shared
// browser pool from _common/playwright-browser.js so multi-module batches
// don't pay the cold-launch cost (~700ms + 200MB) for every scan.

import { withBrowserContext } from './_common/playwright-browser.js';
import middleware from './_common/middleware.js';

const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 720;
const NAV_TIMEOUT_MS = 18000;
const MIN_VIEWPORT = 320;
const MAX_VIEWPORT_W = 3840;
const MAX_VIEWPORT_H = 2160;

/**
 * Scan module: capture a Playwright screenshot of the target URL using a
 * shared browser pool (P1-5). Returns the image as a base64-encoded data
 * URI so the frontend can embed it directly.
 *
 * @param {string} targetUrl Normalised target URL.
 * @param {object} req Per-request context (carries scanOptions for
 *   per-request overrides like viewport / device emulation).
 * @returns {Promise<{image?: string, error?: string}>}
 */
const screenshotHandler = async (targetUrl, req) => {
  const startTime = Date.now();

  if (!targetUrl) {
    return {
      success: false,
      data: { image: null },
      error: 'URL is missing from request',
      duration_ms: Date.now() - startTime,
    };
  }

  if (
    !targetUrl.startsWith('http://') &&
    !targetUrl.startsWith('https://')
  ) {
    targetUrl = 'http://' + targetUrl;
  }

  try {
    new URL(targetUrl);
  } catch {
    return {
      success: false,
      data: { image: null },
      error: 'URL provided is invalid',
      duration_ms: Date.now() - startTime,
    };
  }

  const q = req && typeof req.query === 'object' ? req.query : {};
  let viewportWidth = parseInt(q.viewportWidth, 10);
  let viewportHeight = parseInt(q.viewportHeight, 10);
  if (Number.isNaN(viewportWidth)) viewportWidth = DEFAULT_VIEWPORT_WIDTH;
  if (Number.isNaN(viewportHeight)) viewportHeight = DEFAULT_VIEWPORT_HEIGHT;
  viewportWidth = Math.min(Math.max(viewportWidth, MIN_VIEWPORT), MAX_VIEWPORT_W);
  viewportHeight = Math.min(Math.max(viewportHeight, MIN_VIEWPORT), MAX_VIEWPORT_H);
  const fullPage =
    q.fullPage === 'true' ||
    q.fullPage === true ||
    q.fullPage === '1';

  try {
    const result = await withBrowserContext(async (_context, page) => {
      page.setDefaultTimeout(NAV_TIMEOUT_MS);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      const screenshotBuffer = await page.screenshot({ type: 'png', fullPage });
      return screenshotBuffer.toString('base64');
    }, {
      contextOptions: {
        viewport: { width: viewportWidth, height: viewportHeight },
        ignoreHTTPSErrors: true,
        colorScheme: 'dark',
      },
      launchOverrides: { args: ['--ignore-certificate-errors'] },
    });

    return {
      success: true,
      data: {
        image: result,
        viewport: `${viewportWidth}x${viewportHeight}`,
        fullPage,
        capturedAt: new Date().toISOString(),
      },
      duration_ms: Date.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      data: { image: null },
      error: err?.message || 'Screenshot capture failed',
      duration_ms: Date.now() - startTime,
    };
  }
};

export const handler = middleware(screenshotHandler);
export default handler;
