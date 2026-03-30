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

  it('detects Cloudflare from server header', async () => {
    const handler = await loadHandlerWithAxios(
      jest.fn().mockResolvedValue({
        headers: {
          server: 'cloudflare',
        },
      })
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      hasWaf: true,
      waf: 'Cloudflare',
    });
  });

  it('returns hasWaf false when no known WAF headers are present', async () => {
    const handler = await loadHandlerWithAxios(
      jest.fn().mockResolvedValue({
        headers: {
          server: 'nginx',
        },
      })
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      hasWaf: false,
    });
  });

  it('returns a 500 payload when the upstream request fails', async () => {
    const handler = await loadHandlerWithAxios(
      jest.fn().mockRejectedValue(new Error('connection reset'))
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body).toBe(JSON.stringify({ error: 'connection reset' }));
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
