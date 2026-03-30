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

async function loadHandlerWithDns(dnsImplementation) {
  jest.resetModules();
  await jest.unstable_mockModule('dns', () => ({
    default: dnsImplementation,
  }));
  const { handler } = await import('../block-lists.js');
  return handler;
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('block-lists module', () => {
  afterEach(() => {
    setModulesForTest(new Map());
  });

  it('returns blocklist results for each dns server', async () => {
    const handler = await loadHandlerWithDns({
      resolve4: (_domain, options, cb) => {
        cb(null, options.server === '1.1.1.1' ? ['208.67.222.222'] : ['93.184.216.34']);
      },
      resolve6: (_domain, _options, cb) => cb(Object.assign(new Error('ENODATA'), { code: 'ENODATA' })),
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body.blocklists)).toBe(true);
    expect(response.body.blocklists.length).toBeGreaterThan(10);
    expect(response.body.blocklists[0]).toEqual({
      server: expect.any(String),
      serverIp: expect.any(String),
      isBlocked: expect.any(Boolean),
    });
    expect(response.body.blocklists.some((item) => item.isBlocked)).toBe(true);
  });

  it('returns a graceful all-clear result when nothing is blocked', async () => {
    const handler = await loadHandlerWithDns({
      resolve4: (_domain, _options, cb) => cb(null, ['93.184.216.34']),
      resolve6: (_domain, _options, cb) => cb(null, ['2606:2800:220:1:248:1893:25c8:1946']),
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.blocklists.every((item) => item.isBlocked === false)).toBe(true);
  });

  it('marks a domain as blocked when resolvers return enotfound or servfail', async () => {
    const handler = await loadHandlerWithDns({
      resolve4: (_domain, _options, cb) => cb(Object.assign(new Error('SERVFAIL'), { code: 'SERVFAIL' })),
      resolve6: (_domain, _options, cb) => cb(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' })),
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.blocklists.every((item) => item.isBlocked === true)).toBe(true);
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(new Map([['block-lists', (_req, res) => res.status(200).json({ ok: true })]]));

    const response = await request(app).get('/api/scan/block-lists');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('block-lists')).toBe(true);
  });
});
