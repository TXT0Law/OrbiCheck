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
const WAIT_FOR_SELECTOR_TIMEOUT_MS = 10000;
const WAIT_FOR_MS_MAX = 10000;
const MAX_BROWSER_STEPS = 8;
const MAX_SELECTOR_LENGTH = 500;
const MAX_STEP_URL_LENGTH = 2048;
const INTERACTIVE_STEPS_ENABLED =
  String(process.env.MONITOR_BROWSER_STEPS_INTERACTIVE_ENABLED || '').toLowerCase() === 'true';

function clampInt(value, min, max, fallback) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseSteps(rawSteps) {
  if (rawSteps == null || rawSteps === '') return [];
  let parsed;
  if (typeof rawSteps === 'string') {
    try {
      parsed = JSON.parse(rawSteps);
    } catch (error) {
      throw new Error(`Invalid browser steps JSON: ${error.message}`);
    }
  } else {
    parsed = rawSteps;
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Browser steps must be an array');
  }
  return parsed.slice(0, MAX_BROWSER_STEPS);
}

function validateSelector(selector) {
  if (typeof selector !== 'string' || selector.trim() === '') {
    throw new Error('Browser step selector is required');
  }
  const trimmed = selector.trim();
  if (trimmed.length > MAX_SELECTOR_LENGTH) {
    throw new Error(`Browser step selector exceeds ${MAX_SELECTOR_LENGTH} chars`);
  }
  return trimmed;
}

function validateStepUrl(url) {
  if (typeof url !== 'string' || url.length > MAX_STEP_URL_LENGTH) {
    throw new Error('Browser step url is invalid');
  }
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Browser step goto only supports http/https URLs');
  }
  return parsed.toString();
}

async function applyBrowserSteps(page, steps) {
  for (const rawStep of steps) {
    if (!rawStep || typeof rawStep !== 'object') {
      throw new Error('Browser step must be an object');
    }
    const action = String(rawStep.action || '').toLowerCase();
    if (action === 'goto') {
      await page.goto(validateStepUrl(rawStep.url), { waitUntil: 'domcontentloaded' });
      continue;
    }
    if (action === 'wait') {
      const ms = clampInt(rawStep.ms, 0, WAIT_FOR_MS_MAX, 0);
      if (ms > 0) await page.waitForTimeout(ms);
      continue;
    }
    if (action === 'scroll') {
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      continue;
    }
    if (action === 'click') {
      if (!INTERACTIVE_STEPS_ENABLED) {
        throw new Error('Interactive browser steps are disabled');
      }
      await page.click(validateSelector(rawStep.selector));
      continue;
    }
    if (action === 'type') {
      if (!INTERACTIVE_STEPS_ENABLED) {
        throw new Error('Interactive browser steps are disabled');
      }
      if (typeof rawStep.value !== 'string') {
        throw new Error('Browser type step value must be a string');
      }
      await page.fill(validateSelector(rawStep.selector), rawStep.value);
      continue;
    }
    throw new Error(`Unsupported browser step action: ${action || 'missing'}`);
  }
}

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

  const q = {
    ...((req && typeof req.body === 'object' && req.body) ? req.body : {}),
    ...((req && typeof req.query === 'object' && req.query) ? req.query : {}),
  };
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
  const waitForSelector =
    typeof q.waitForSelector === 'string' && q.waitForSelector.trim()
      ? validateSelector(q.waitForSelector)
      : '';
  const waitForMs = clampInt(q.waitForMs, 0, WAIT_FOR_MS_MAX, 0);
  const browserSteps = parseSteps(q.steps);

  try {
    const result = await withBrowserContext(async (_context, page) => {
      page.setDefaultTimeout(NAV_TIMEOUT_MS);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      if (browserSteps.length > 0) {
        await applyBrowserSteps(page, browserSteps);
      }
      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, {
          state: 'attached',
          timeout: WAIT_FOR_SELECTOR_TIMEOUT_MS,
        });
      }
      if (waitForMs > 0) {
        await page.waitForTimeout(waitForMs);
      }
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
        waitForSelector: waitForSelector || null,
        waitForMs,
        stepsApplied: browserSteps.length,
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
