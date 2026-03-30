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

async function loadHandlerWithAxios(mockGet) {
  jest.resetModules();
  await jest.unstable_mockModule('axios', () => ({
    default: { get: mockGet },
  }));
  const { handler } = await import('../quality.js');
  return handler;
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('quality module', () => {
  const originalGoogleKey = process.env.GOOGLE_CLOUD_API_KEY;

  afterEach(() => {
    process.env.GOOGLE_CLOUD_API_KEY = originalGoogleKey;
    setModulesForTest(new Map());
  });

  it('returns pagespeed data on success', async () => {
    process.env.GOOGLE_CLOUD_API_KEY = 'google-key';
    const handler = await loadHandlerWithAxios(
      jest.fn().mockResolvedValue({
        data: {
          lighthouseResult: { categories: { performance: { score: 0.92 } } },
        },
      })
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.lighthouseResult.categories.performance.score).toBe(0.92);
    expect(response.body.duration_ms).toEqual(expect.any(Number));
  });

  it('returns a graceful note when the google api key is not configured', async () => {
    delete process.env.GOOGLE_CLOUD_API_KEY;
    const handler = await loadHandlerWithAxios(jest.fn());

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.categories).toEqual([]);
    expect(response.body.data.note).toContain('not configured');
  });

  it('returns success false with an error message when pagespeed fails', async () => {
    process.env.GOOGLE_CLOUD_API_KEY = 'google-key';
    const handler = await loadHandlerWithAxios(
      jest.fn().mockRejectedValue({
        response: {
          status: 400,
          data: { error: { message: 'API key invalid' } },
        },
      })
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.data.categories).toEqual([]);
    expect(response.body.error).toContain('PageSpeed API rejected request');
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(new Map([['quality', (_req, res) => res.status(200).json({ ok: true })]]));

    const response = await request(app).get('/api/scan/quality');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('quality')).toBe(true);
  });
});
