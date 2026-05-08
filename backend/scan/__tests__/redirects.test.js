import { jest } from '@jest/globals';
import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

const GENERIC_ERROR_MESSAGE = 'Request failed while processing this scan module.';

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

async function loadHandlerWithGot(mockGot) {
  jest.resetModules();
  await jest.unstable_mockModule('got', () => ({
    default: mockGot,
  }));
  const { handler } = await import('../redirects.js');
  return handler;
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('redirects module', () => {
  beforeEach(() => {
    setModulesForTest(new Map());
  });

  it('returns redirect chain captured from got hooks plus final URL', async () => {
    const mockGot = jest.fn(async (_url, options) => {
      const beforeRedirect = options.hooks.beforeRedirect[0];
      beforeRedirect({}, { headers: { location: 'https://www.example.com' } });
      beforeRedirect({}, { headers: { location: 'https://www.example.com/home' } });
      return { statusCode: 200, url: 'https://www.example.com/home' };
    });

    const handler = await loadHandlerWithGot(mockGot);
    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.redirects).toEqual([
      'https://example.com',
      'https://www.example.com',
      'https://www.example.com/home',
    ]);
  });

  it('appends the final URL when it differs from the last beforeRedirect target (P2-6)', async () => {
    // Real got behaviour: server can rewrite the final hop (e.g. add trailing
    // slash, normalise hostname). beforeRedirect captures the Location header
    // value, but the resolved response.url is the truth. Make sure we add it.
    const mockGot = jest.fn(async (_url, options) => {
      const beforeRedirect = options.hooks.beforeRedirect[0];
      beforeRedirect({}, { headers: { location: 'https://www.example.com/home' } });
      return { statusCode: 200, url: 'https://www.example.com/home/' };
    });

    const handler = await loadHandlerWithGot(mockGot);
    const response = await invokeHandler(handler);

    expect(response.body.data.redirects).toEqual([
      'https://example.com',
      'https://www.example.com/home',
      'https://www.example.com/home/',
    ]);
  });

  it('returns only the original URL when there are no redirects and no final URL info', async () => {
    const handler = await loadHandlerWithGot(
      jest.fn().mockResolvedValue({ statusCode: 200 })
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({
      redirects: ['https://example.com'],
    });
  });

  it('does not double-append final URL when it matches the last hop (P2-6 dedupe)', async () => {
    const mockGot = jest.fn(async (_url, options) => {
      const beforeRedirect = options.hooks.beforeRedirect[0];
      beforeRedirect({}, { headers: { location: 'https://www.example.com/home' } });
      return { statusCode: 200, url: 'https://www.example.com/home' };
    });

    const handler = await loadHandlerWithGot(mockGot);
    const response = await invokeHandler(handler);

    expect(response.body.data.redirects).toEqual([
      'https://example.com',
      'https://www.example.com/home',
    ]);
  });

  it('returns a generic error envelope when got throws', async () => {
    const handler = await loadHandlerWithGot(
      jest.fn().mockRejectedValue(new Error('redirect loop'))
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(
      new Map([
        [
          'redirects',
          (_req, res) => res.status(200).json({ ok: true }),
        ],
      ])
    );

    const response = await request(app).get('/api/scan/redirects');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('redirects')).toBe(true);
  });
});
