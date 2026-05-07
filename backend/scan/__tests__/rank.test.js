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
  const { handler } = await import('../rank.js');
  return handler;
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('rank module', () => {
  const originalApiKey = process.env.TRANCO_API_KEY;
  const originalUsername = process.env.TRANCO_USERNAME;

  afterEach(() => {
    process.env.TRANCO_API_KEY = originalApiKey;
    process.env.TRANCO_USERNAME = originalUsername;
    setModulesForTest(new Map());
  });

  it('passes Tranco basic auth when TRANCO_API_KEY is configured', async () => {
    process.env.TRANCO_API_KEY = 'api-key';
    process.env.TRANCO_USERNAME = 'user';
    const mockGet = jest.fn().mockResolvedValue({
      data: { ranks: [{ list: 'top-1m', rank: 12345 }] },
    });
    const handler = await loadHandlerWithAxios(mockGet);

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.ranks[0].rank).toBe(12345);
    expect(mockGet).toHaveBeenCalledTimes(1);
    const [calledUrl, calledConfig, ...extras] = mockGet.mock.calls[0];
    expect(calledUrl).toBe('https://tranco-list.eu/api/ranks/domain/example.com');
    expect(extras).toEqual([]);
    expect(calledConfig).toEqual(
      expect.objectContaining({
        timeout: 5000,
        auth: { username: 'user', password: 'api-key' },
      }),
    );
  });

  it('omits the auth config when TRANCO_API_KEY is not set', async () => {
    delete process.env.TRANCO_API_KEY;
    delete process.env.TRANCO_USERNAME;
    const mockGet = jest.fn().mockResolvedValue({ data: { ranks: [] } });
    const handler = await loadHandlerWithAxios(mockGet);

    await invokeHandler(handler);

    expect(mockGet).toHaveBeenCalledTimes(1);
    const [, calledConfig] = mockGet.mock.calls[0];
    expect(calledConfig).toEqual({ timeout: 5000 });
    expect(calledConfig).not.toHaveProperty('auth');
  });

  it('returns a skipped payload when the domain has no rank data', async () => {
    const handler = await loadHandlerWithAxios(
      jest.fn().mockResolvedValue({ data: { ranks: [] } })
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.skipped).toContain("isn't ranked");
  });

  it('returns an error payload when the ranking provider fails', async () => {
    const handler = await loadHandlerWithAxios(
      jest.fn().mockRejectedValue(new Error('tranco unavailable'))
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.error).toContain('tranco unavailable');
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(new Map([['rank', (_req, res) => res.status(200).json({ ok: true })]]));

    const response = await request(app).get('/api/scan/rank');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('rank')).toBe(true);
  });
});
