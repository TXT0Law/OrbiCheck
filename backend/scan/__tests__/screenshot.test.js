/**
 * Tests for screenshot module (Playwright).
 * Uses mocked handlers; real capture requires Playwright Chromium.
 * Keep this file updated when changing ../screenshot.js (CI: require-tests.sh).
 */

import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

describe('screenshot module (Playwright)', () => {
  it('returns success with image when mock captures successfully', async () => {
    const mockScreenshot = (_req, res) => {
      res.status(200).json({
        success: true,
        image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
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
    expect(body.image).toBeDefined();
    expect(body.viewport).toBe('1280x720');
    expect(body.duration_ms).toBeGreaterThan(0);
  });

  it('returns 400 when URL is missing', async () => {
    setModulesForTest(new Map([['screenshot', () => {}]]));
    const response = await request(app).get('/api/scan/screenshot');
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toMatch(/url|missing/i);
  });

  it('returns error for invalid URL when mock returns error structure', async () => {
    const mockInvalid = (_req, res) => {
      res.status(200).json({
        success: false,
        image: null,
        error: 'URL provided is invalid',
        duration_ms: 5,
      });
    };
    setModulesForTest(new Map([['screenshot', mockInvalid]]));

    const response = await request(app)
      .get('/api/scan/screenshot')
      .query({ url: 'http://' });

    expect(response.statusCode).toBe(200);
    const body = response.body;
    expect(body.success).toBe(false);
    expect(body.image).toBeNull();
    expect(body.error).toBeTruthy();
  });

  it('forwards viewportWidth, viewportHeight, and fullPage query params to the handler', async () => {
    let capturedQuery = null;
    const mockScreenshot = (req, res) => {
      capturedQuery = { ...req.query };
      res.status(200).json({
        success: true,
        image:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
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
