// backend/scan/screenshot.js
// Screenshot capture using Playwright (replaces Puppeteer)
import { chromium } from 'playwright';
import middleware from './_common/middleware.js';

const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 720;
const NAV_TIMEOUT_MS = 18000;
const MIN_VIEWPORT = 320;
const MAX_VIEWPORT_W = 3840;
const MAX_VIEWPORT_H = 2160;

const screenshotHandler = async (targetUrl, req) => {
  const startTime = Date.now();

  if (!targetUrl) {
    return {
      success: false,
      image: null,
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
      image: null,
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

  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--ignore-certificate-errors',
      ],
    });

    const context = await browser.newContext({
      viewport: {
        width: viewportWidth,
        height: viewportHeight,
      },
      ignoreHTTPSErrors: true,
      colorScheme: 'dark',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT_MS);

    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
    });

    const screenshotBuffer = await page.screenshot({
      type: 'png',
      fullPage,
    });
    const base64Screenshot =
      screenshotBuffer.toString('base64');

    return {
      success: true,
      image: base64Screenshot,
      viewport: `${viewportWidth}x${viewportHeight}`,
      fullPage,
      capturedAt: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      image: null,
      error: err?.message || 'Screenshot capture failed',
      duration_ms: Date.now() - startTime,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

export const handler = middleware(screenshotHandler);
export default handler;
