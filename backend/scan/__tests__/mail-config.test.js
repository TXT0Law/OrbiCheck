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

async function loadHandlerWithDns(promisesImplementation) {
  jest.resetModules();
  await jest.unstable_mockModule('dns', () => ({
    default: {
      promises: promisesImplementation,
    },
  }));
  const { handler } = await import('../mail-config.js');
  return handler;
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('mail-config module', () => {
  afterEach(() => {
    setModulesForTest(new Map());
  });

  it('returns mail records and detected providers on success', async () => {
    const handler = await loadHandlerWithDns({
      resolveMx: jest.fn().mockResolvedValue([
        { exchange: 'mx1.yahoodns.net', priority: 10 },
        { exchange: 'mail.mimecast.com', priority: 20 },
      ]),
      resolveTxt: jest.fn().mockResolvedValue([
        ['v=spf1 include:_spf.google.com ~all'],
        ['google-site-verification=token'],
      ]),
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.mxRecords).toHaveLength(2);
    expect(response.body.txtRecords).toHaveLength(2);
    expect(response.body.mailServices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'Google Workspace' }),
        expect.objectContaining({ provider: 'Yahoo' }),
        expect.objectContaining({ provider: 'Mimecast' }),
      ])
    );
  });

  it('returns a skipped payload when no mail records exist', async () => {
    const handler = await loadHandlerWithDns({
      resolveMx: jest.fn().mockRejectedValue(Object.assign(new Error('ENODATA'), { code: 'ENODATA' })),
      resolveTxt: jest.fn(),
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.skipped).toContain('No mail server in use');
  });

  it('returns a 500 payload when dns lookup fails unexpectedly', async () => {
    const handler = await loadHandlerWithDns({
      resolveMx: jest.fn().mockRejectedValue(new Error('resolver crashed')),
      resolveTxt: jest.fn(),
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: 'resolver crashed' });
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(new Map([['mail-config', (_req, res) => res.status(200).json({ ok: true })]]));

    const response = await request(app).get('/api/scan/mail-config');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('mail-config')).toBe(true);
  });
});
