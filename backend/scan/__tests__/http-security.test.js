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
  const { handler } = await import('../http-security.js');
  return handler;
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('http-security module', () => {
  beforeEach(() => {
    setModulesForTest(new Map());
  });

  it('returns header security flags when security headers are present', async () => {
    const handler = await loadHandlerWithAxios(
      jest.fn().mockResolvedValue({
        headers: {
          'strict-transport-security': 'max-age=63072000',
          'x-frame-options': 'DENY',
          'x-content-type-options': 'nosniff',
          'x-xss-protection': '1; mode=block',
          'content-security-policy': "default-src 'self'",
        },
      })
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      strictTransportPolicy: true,
      xFrameOptions: true,
      xContentTypeOptions: true,
      xXSSProtection: true,
      contentSecurityPolicy: true,
    });
  });

  it('returns false flags when security headers are absent', async () => {
    const handler = await loadHandlerWithAxios(
      jest.fn().mockResolvedValue({
        headers: {},
      })
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      strictTransportPolicy: false,
      xFrameOptions: false,
      xContentTypeOptions: false,
      xXSSProtection: false,
      contentSecurityPolicy: false,
    });
  });

  it('returns a 500 payload when the upstream request fails', async () => {
    const handler = await loadHandlerWithAxios(
      jest.fn().mockRejectedValue(new Error('network down'))
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body).toBe(JSON.stringify({ error: 'network down' }));
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(
      new Map([
        [
          'http-security',
          (_req, res) => res.status(200).json({ ok: true }),
        ],
      ])
    );

    const response = await request(app).get('/api/scan/http-security');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('http-security')).toBe(true);
  });
});
