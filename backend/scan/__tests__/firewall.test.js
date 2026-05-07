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

async function loadHandlerWithHttp(mockGet) {
  jest.resetModules();
  await jest.unstable_mockModule('../_common/http.js', () => ({
    http: { get: mockGet },
    httpWith: () => ({ get: mockGet }),
    HTTP_DEFAULT_TIMEOUT_MS: 1000,
  }));
  const { handler } = await import('../firewall.js');
  return handler;
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('firewall module', () => {
  beforeEach(() => {
    setModulesForTest(new Map());
  });

  it('detects Cloudflare from server header (200 OK)', async () => {
    const handler = await loadHandlerWithHttp(
      jest.fn().mockResolvedValue({
        status: 200,
        headers: { server: 'cloudflare' },
      })
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      hasWaf: true,
      waf: 'Cloudflare',
      blocked: false,
      evidence: 'server: cloudflare',
    });
  });

  it('detects Cloudflare via cf-ray header even with no server header', async () => {
    const handler = await loadHandlerWithHttp(
      jest.fn().mockResolvedValue({
        status: 200,
        headers: { 'cf-ray': '1234abcd' },
      })
    );

    const response = await invokeHandler(handler);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      hasWaf: true,
      waf: 'Cloudflare',
      evidence: 'cf-ray header present',
    });
  });

  it('reports hasWaf=true (blocked) when WAF returns 403 with signature header', async () => {
    const handler = await loadHandlerWithHttp(
      jest.fn().mockResolvedValue({
        status: 403,
        headers: { server: 'cloudflare' },
      })
    );

    const response = await invokeHandler(handler);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      hasWaf: true,
      waf: 'Cloudflare',
      blocked: true,
      statusCode: 403,
    });
  });

  it('reports hasWaf=true (blocked, unknown vendor) when status is 503 with no headers', async () => {
    const handler = await loadHandlerWithHttp(
      jest.fn().mockResolvedValue({
        status: 503,
        headers: {},
      })
    );

    const response = await invokeHandler(handler);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      hasWaf: true,
      waf: 'Unknown WAF',
      blocked: true,
      statusCode: 503,
    });
  });

  it('reports hasWaf=true (blocked) when WAF closes connection (ECONNRESET)', async () => {
    const econnreset = Object.assign(new Error('connection reset'), {
      code: 'ECONNRESET',
    });
    const handler = await loadHandlerWithHttp(
      jest.fn().mockRejectedValue(econnreset)
    );

    const response = await invokeHandler(handler);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      hasWaf: true,
      waf: 'Unknown WAF',
      blocked: true,
      evidence: 'connection terminated (ECONNRESET)',
    });
  });

  it('returns hasWaf=false when no known WAF headers are present', async () => {
    const handler = await loadHandlerWithHttp(
      jest.fn().mockResolvedValue({
        status: 200,
        headers: { server: 'nginx' },
      })
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({ hasWaf: false });
  });

  it('returns a generic error envelope when fetch fails for non-WAF reasons', async () => {
    const handler = await loadHandlerWithHttp(
      jest.fn().mockRejectedValue(new Error('boom'))
    );

    const response = await invokeHandler(handler);

    expect(response.body.success).toBe(false);
    // Internal error messages are masked at the middleware boundary; we
    // only care that the envelope is well-formed.
    expect(response.body.error).toBe('Request failed while processing this scan module.');
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(
      new Map([
        [
          'firewall',
          (_req, res) => res.status(200).json({ ok: true }),
        ],
      ])
    );

    const response = await request(app).get('/api/scan/firewall');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('firewall')).toBe(true);
  });
});
