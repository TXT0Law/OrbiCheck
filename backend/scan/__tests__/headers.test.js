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

async function loadHandlerWithAxios(mockGet) {
  jest.resetModules();
  await jest.unstable_mockModule('../_common/http.js', () => ({
    http: { get: mockGet },
    httpWith: () => ({ get: mockGet }),
    HTTP_DEFAULT_TIMEOUT_MS: 1000,
  }));
  const { handler } = await import('../headers.js');
  return handler;
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('headers module', () => {
  beforeEach(() => {
    setModulesForTest(new Map());
  });

  it('returns response headers on success', async () => {
    const handler = await loadHandlerWithAxios(
      jest.fn().mockResolvedValue({
        headers: {
          server: 'nginx',
          'content-type': 'text/html',
        },
      })
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.server).toBe('nginx');
    expect(response.body.data['content-type']).toBe('text/html');
  });

  it('returns an empty object when the response has no headers', async () => {
    const handler = await loadHandlerWithAxios(
      jest.fn().mockResolvedValue({
        headers: {},
      })
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({});
  });

  it('returns a generic error envelope when the request throws', async () => {
    const handler = await loadHandlerWithAxios(
      jest.fn().mockRejectedValue(new Error('boom'))
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
          'headers',
          (_req, res) => res.status(200).json({ ok: true }),
        ],
      ])
    );

    const response = await request(app).get('/api/scan/headers');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('headers')).toBe(true);
  });
});
