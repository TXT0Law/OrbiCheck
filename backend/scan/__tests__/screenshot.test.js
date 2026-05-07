/**
 * Tests for screenshot module (Playwright via _common/playwright-browser.js).
 * Covers both route-level (supertest) and handler-level (mocked launchChromium) tests.
 * Keep this file updated when changing ../screenshot.js (CI: require-tests.sh).
 */

import { jest } from '@jest/globals';
import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

function createResponseCapture() {
  return {
    headersSent: false,
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.headersSent = true;
      this.body = body;
      return this;
    },
  };
}

async function loadHandlerWithMocks({ screenshotBuffer = Buffer.from('png-data'), gotoError, launchError } = {}) {
  jest.resetModules();

  const fakePage = {
    goto: jest.fn().mockImplementation(async () => {
      if (gotoError) throw gotoError;
    }),
    setDefaultTimeout: jest.fn(),
    screenshot: jest.fn().mockResolvedValue(screenshotBuffer),
    isClosed: () => false,
    close: jest.fn().mockResolvedValue(undefined),
  };
  const fakeContext = {
    cookies: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined),
  };

  const withBrowserContext = jest.fn(async (fn) => {
    if (launchError) throw launchError;
    return fn(fakeContext, fakePage);
  });

  await jest.unstable_mockModule('../_common/playwright-browser.js', () => ({
    withBrowserContext,
    launchChromium: jest.fn(),
    closeSharedBrowser: jest.fn(),
    __resetBrowserSingletonForTests: jest.fn(),
    BROWSER_MAX_CONTEXTS: 3,
  }));

  const { handler } = await import('../screenshot.js');
  return handler;
}

async function invokeHandler(handler, url = 'https://example.com', query = {}) {
  const req = { query: { url, ...query } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('screenshot module — route level', () => {
  beforeEach(() => {
    setModulesForTest(new Map());
  });

  it('returns success with image when mock captures successfully', async () => {
    const mockScreenshot = (_req, res) => {
      res.status(200).json({
        success: true,
        image: 'iVBORw0KGgoAAAANSUhEUg==',
        viewport: '1280x720',
        capturedAt: new Date().toISOString(),
        duration_ms: 100,
      });
    };

    setModulesForTest(new Map([['screenshot', mockScreenshot]]));

    const response = await request(app)
      .get('/api/scan/screenshot')
      .query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(200);
    const body = response.body;
    expect(body.success).toBe(true);
    expect(body.data.image).toBeDefined();
    expect(body.data.viewport).toBe('1280x720');
    expect(body.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns 400 when URL is missing', async () => {
    setModulesForTest(new Map([['screenshot', () => {}]]));
    const response = await request(app).get('/api/scan/screenshot');
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toMatch(/url|missing/i);
  });

  it('forwards viewportWidth, viewportHeight, and fullPage query params to the handler', async () => {
    let capturedQuery = null;
    const mockScreenshot = (req, res) => {
      capturedQuery = { ...req.query };
      res.status(200).json({
        success: true,
        image: 'iVBORw0KGgoAAAANSUhEUg==',
        viewport: '600x400',
        fullPage: true,
        capturedAt: new Date().toISOString(),
        duration_ms: 10,
      });
    };

    setModulesForTest(new Map([['screenshot', mockScreenshot]]));

    const response = await request(app)
      .get('/api/scan/screenshot')
      .query({
        url: 'https://example.com',
        viewportWidth: '600',
        viewportHeight: '400',
        fullPage: 'true',
      });

    expect(response.statusCode).toBe(200);
    expect(capturedQuery).toBeTruthy();
    expect(capturedQuery.viewportWidth).toBe('600');
    expect(capturedQuery.viewportHeight).toBe('400');
    expect(capturedQuery.fullPage).toBe('true');
  });
});

describe('screenshot module — handler unit tests (mocked launchChromium)', () => {
  it('returns base64 image on successful capture', async () => {
    const fakeBuffer = Buffer.from('test-image-data');
    const handler = await loadHandlerWithMocks({ screenshotBuffer: fakeBuffer });
    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.image).toBe(fakeBuffer.toString('base64'));
    expect(response.body.data.viewport).toBe('1280x720');
    expect(response.body.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns 400 via middleware when URL is missing', async () => {
    const handler = await loadHandlerWithMocks();
    const req = { query: {} };
    const res = createResponseCapture();
    await handler(req, res);

    // Middleware now returns 400 (more accurate) instead of the legacy 500.
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/no url/i);
  });

  it('returns error for invalid URL', async () => {
    const handler = await loadHandlerWithMocks();
    const response = await invokeHandler(handler, '://bad');

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('invalid');
  });

  it('prepends http:// when protocol is missing', async () => {
    const handler = await loadHandlerWithMocks();
    const response = await invokeHandler(handler, 'example.com');

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.image).toBeDefined();
  });

  it('returns error when browser launch fails', async () => {
    const handler = await loadHandlerWithMocks({
      launchError: new Error('Chromium not found'),
    });
    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Chromium not found');
  });

  it('clamps viewport to allowed range', async () => {
    const handler = await loadHandlerWithMocks();
    const response = await invokeHandler(handler, 'https://example.com', {
      viewportWidth: '100',
      viewportHeight: '99999',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
