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
  await jest.unstable_mockModule('../_common/http.js', () => ({
    http: { get: mockGet },
    httpWith: () => ({ get: mockGet }),
    HTTP_DEFAULT_TIMEOUT_MS: 1000,
  }));
  const { handler } = await import('../archives.js');
  return handler;
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('archives module', () => {
  afterEach(() => {
    setModulesForTest(new Map());
  });

  it('returns wayback archive details on success', async () => {
    const handler = await loadHandlerWithAxios(
      jest.fn().mockResolvedValue({
        data: [
          ['timestamp', 'statuscode', 'digest', 'length', 'offset'],
          ['20240101000000', '200', 'abc', '1000', '0'],
          ['20240102000000', '200', 'def', '1200', '1'],
          ['20240103000000', '200', 'def', '1100', '2'],
        ],
      })
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    const data = response.body.data;
    expect(data.totalScans).toBe(3);
    expect(data.changeCount).toBe(1);
    expect(data.averagePageSize).toBe(1100);
    expect(data.scanUrl).toBe('https://example.com');
  });

  it('returns a skipped payload when the site has no archive history', async () => {
    const handler = await loadHandlerWithAxios(
      jest.fn().mockResolvedValue({
        data: [['timestamp', 'statuscode', 'digest', 'length', 'offset']],
      })
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.skipped).toContain('never before been archived');
  });

  it('returns an error payload when wayback lookup fails', async () => {
    const handler = await loadHandlerWithAxios(
      jest.fn().mockRejectedValue(new Error('wayback unavailable'))
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.error).toContain('wayback unavailable');
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(new Map([['archives', (_req, res) => res.status(200).json({ ok: true })]]));

    const response = await request(app).get('/api/scan/archives');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('archives')).toBe(true);
  });
});
