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

function dnsError(code) {
  return Object.assign(new Error(code), { code });
}

describe('block-lists module', () => {
  afterEach(() => {
    setModulesForTest(new Map());
  });

  it('marks each DNS server with a tri-state result and a boolean isBlocked', async () => {
    const handler = await loadHandlerWithDns({
      resolve4: (_domain, options, cb) => {
        cb(null, options.server === '1.1.1.1' ? ['208.67.222.222'] : ['93.184.216.34']);
      },
      resolve6: (_domain, _options, cb) => cb(dnsError('ENODATA')),
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    const blocklists = response.body.data.blocklists;
    expect(Array.isArray(blocklists)).toBe(true);
    expect(blocklists.length).toBeGreaterThan(10);
    expect(blocklists[0]).toEqual(
      expect.objectContaining({
        server: expect.any(String),
        serverIp: expect.any(String),
        state: expect.stringMatching(/^(blocked|clear|unknown)$/),
        isBlocked: expect.any(Boolean),
      }),
    );
    const blockedRows = blocklists.filter((row) => row.isBlocked);
    expect(blockedRows.length).toBeGreaterThan(0);
    expect(blockedRows.every((row) => row.state === 'blocked')).toBe(true);
    const clearRows = blocklists.filter((row) => row.state === 'clear');
    expect(clearRows.length).toBeGreaterThan(0);
    expect(clearRows.every((row) => row.isBlocked === false)).toBe(true);
  });

  it('returns a graceful all-clear result when nothing is blocked', async () => {
    const handler = await loadHandlerWithDns({
      resolve4: (_domain, _options, cb) => cb(null, ['93.184.216.34']),
      resolve6: (_domain, _options, cb) => cb(null, ['2606:2800:220:1:248:1893:25c8:1946']),
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    const blocklists = response.body.data.blocklists;
    expect(blocklists.every((row) => row.state === 'clear')).toBe(true);
    expect(blocklists.every((row) => row.isBlocked === false)).toBe(true);
  });

  it('treats ENOTFOUND on both record types as unknown (regression for false positives)', async () => {
    const handler = await loadHandlerWithDns({
      resolve4: (_domain, _options, cb) => cb(dnsError('ENOTFOUND')),
      resolve6: (_domain, _options, cb) => cb(dnsError('ENOTFOUND')),
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    const blocklists = response.body.data.blocklists;
    expect(blocklists.every((row) => row.state === 'unknown')).toBe(true);
    expect(blocklists.every((row) => row.isBlocked === false)).toBe(true);
  });

  it('treats SERVFAIL on the A record as a deliberate block, without consulting AAAA', async () => {
    const resolve6 = jest.fn();
    const handler = await loadHandlerWithDns({
      resolve4: (_domain, _options, cb) => cb(dnsError('SERVFAIL')),
      resolve6,
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    const blocklists = response.body.data.blocklists;
    expect(blocklists.every((row) => row.state === 'blocked')).toBe(true);
    expect(blocklists.every((row) => row.isBlocked === true)).toBe(true);
    expect(resolve6).not.toHaveBeenCalled();
  });

  it('falls back to AAAA when A returns ENOTFOUND, then flags sinkhole IPv6 as blocked', async () => {
    const handler = await loadHandlerWithDns({
      resolve4: (_domain, _options, cb) => cb(dnsError('ENOTFOUND')),
      resolve6: (_domain, _options, cb) => cb(null, ['2a02:6b8::feed:bad']),
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    const blocklists = response.body.data.blocklists;
    expect(blocklists.every((row) => row.state === 'blocked')).toBe(true);
    expect(blocklists.every((row) => row.isBlocked === true)).toBe(true);
  });

  it('queries DNS_SERVERS in parallel using Promise.allSettled', async () => {
    let inflight = 0;
    let maxInflight = 0;
    const handler = await loadHandlerWithDns({
      resolve4: (_domain, _options, cb) => {
        inflight += 1;
        if (inflight > maxInflight) maxInflight = inflight;
        setTimeout(() => {
          inflight -= 1;
          cb(null, ['93.184.216.34']);
        }, 10);
      },
      resolve6: (_domain, _options, cb) => cb(dnsError('ENODATA')),
    });

    await invokeHandler(handler);
    expect(maxInflight).toBeGreaterThan(1);
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
