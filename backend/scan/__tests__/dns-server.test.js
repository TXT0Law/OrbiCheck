import { jest } from '@jest/globals';
import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

const TARGET_URL = 'https://example.com';

function createDnsMock({ resolve4Result, reverseResult }) {
  return {
    promises: {
      resolve4: jest.fn().mockImplementation(async () => resolve4Result),
      reverse: jest.fn().mockImplementation(async () => reverseResult),
    },
  };
}

async function loadHandlerWithDns(mock) {
  jest.resetModules();
  await jest.unstable_mockModule('dns', () => ({
    default: mock,
    promises: mock.promises,
  }));
  const { handler } = await import('../dns-server.js');
  return handler;
}

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

async function invokeHandler(handler, url = TARGET_URL) {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('dns-server module', () => {
  afterEach(() => {
    setModulesForTest(new Map());
  });

  it('returns PTR + RDNS data without probing arbitrary IPs over HTTPS', async () => {
    const dnsMock = createDnsMock({
      resolve4Result: ['1.1.1.1'],
      reverseResult: ['one.one.one.one'],
    });
    const handler = await loadHandlerWithDns(dnsMock);

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.domain).toBe('example.com');
    expect(Array.isArray(response.body.data.dns)).toBe(true);
    expect(response.body.data.dns[0]).toEqual({
      address: '1.1.1.1',
      hostname: 'one.one.one.one',
      ptrRecords: ['one.one.one.one'],
    });
    // Critical regression guard: dohDirectSupports must NOT be present.
    expect(response.body.data.dns[0]).not.toHaveProperty('dohDirectSupports');
  });

  it('returns empty PTR list when reverse lookup fails', async () => {
    const reverseError = Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
    const dnsMock = createDnsMock({
      resolve4Result: ['1.2.3.4'],
      reverseResult: undefined,
    });
    dnsMock.promises.reverse = jest.fn().mockRejectedValue(reverseError);

    const handler = await loadHandlerWithDns(dnsMock);

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.dns[0]).toEqual({
      address: '1.2.3.4',
      hostname: null,
      ptrRecords: [],
    });
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(new Map([['dns-server', (_req, res) => res.status(200).json({})]]));

    const response = await request(app).get('/api/scan/dns-server');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('dns-server')).toBe(true);
  });
});
