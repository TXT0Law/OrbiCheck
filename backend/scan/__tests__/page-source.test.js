/**
 * Tests for page-source module.
 * Uses mocked handlers; real fetch requires network.
 */

import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

describe('page-source module', () => {
  it('returns HTML for a valid URL when mock succeeds', async () => {
    const mockPageSource = (_req, res) => {
      res.status(200).json({
        success: true,
        html: '<!DOCTYPE html><html><head></head><body>Hello</body></html>',
        statusCode: 200,
        contentType: 'text/html; charset=utf-8',
        contentLength: 62,
        truncated: false,
        duration_ms: 100,
      });
    };

    setModulesForTest(new Map([['page-source', mockPageSource]]));

    const response = await request(app)
      .get('/api/scan/page-source')
      .query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(200);
    const body = response.body;
    expect(body.success).toBe(true);
    expect(body.html).toContain('<!DOCTYPE html>');
    expect(body.html).toContain('<html>');
    expect(body.statusCode).toBe(200);
    expect(body.contentLength).toBeGreaterThan(0);
    expect(typeof body.duration_ms).toBe('number');
  });

  it('returns error structure for unreachable URL when mock fails', async () => {
    const mockFail = (_req, res) => {
      res.status(200).json({
        success: false,
        html: '',
        statusCode: null,
        contentType: '',
        contentLength: 0,
        truncated: false,
        error: 'getaddrinfo ENOTFOUND nonexistent.invalid.tld',
        duration_ms: 50,
      });
    };

    setModulesForTest(new Map([['page-source', mockFail]]));

    const response = await request(app)
      .get('/api/scan/page-source')
      .query({ url: 'https://nonexistent.invalid.tld' });

    expect(response.statusCode).toBe(200);
    const body = response.body;
    expect(body.success).toBe(false);
    expect(body.html).toBe('');
    expect(body.error).toBeTruthy();
  });

  it('handles missing URL with 400 from server', async () => {
    setModulesForTest(new Map([['page-source', () => {}]]));
    const response = await request(app).get('/api/scan/page-source');
    expect(response.statusCode).toBe(400);
  });
});
