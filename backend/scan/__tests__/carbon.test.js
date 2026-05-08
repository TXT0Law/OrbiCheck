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

async function loadHandlerWithHttp(mockGet) {
  jest.resetModules();
  await jest.unstable_mockModule('../_common/http.js', () => ({
    http: { get: mockGet },
    httpWith: () => ({ get: mockGet }),
    HTTP_DEFAULT_TIMEOUT_MS: 1000,
  }));
  const { handler } = await import('../carbon.js');
  return handler;
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

function makeGet({ pageBody, apiResponse }) {
  // Helper to wire up a typical "page first, then API" sequence. Each
  // response can be either a payload-only object or a full
  // `{ status, data }` envelope.
  const normalise = (entry) => (entry && typeof entry === 'object' && 'status' in entry
    ? entry
    : { status: 200, data: entry });
  const normalisedPage = normalise(pageBody);
  const normalisedApi = normalise(apiResponse);
  return jest.fn(async (url) => {
    if (url.includes('websitecarbon')) return normalisedApi;
    return normalisedPage;
  });
}

describe('carbon module', () => {
  afterEach(() => {
    setModulesForTest(new Map());
  });

  it('returns website carbon data on success', async () => {
    const mockGet = makeGet({
      pageBody: Buffer.from('<html>Hello world</html>'),
      apiResponse: { statistics: { adjustedBytes: 1024, energy: 0.1 } },
    });

    const handler = await loadHandlerWithHttp(mockGet);
    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.statistics.adjustedBytes).toBe(1024);
    expect(response.body.data.scanUrl).toBe('https://example.com');
  });

  it('returns a plain `{ skipped: ... }` envelope (not Netlify-style) when stats are empty', async () => {
    // P2 follow-up: the previous implementation returned
    // `{ statusCode: 200, body: JSON.stringify({ skipped: ... }) }` which
    // forced normaliseEnvelope to JSON.parse the body back out. Now we
    // return the data object directly so the envelope contract matches the
    // rest of the modules.
    const mockGet = makeGet({
      pageBody: Buffer.from('<html>Hello world</html>'),
      apiResponse: { statistics: { adjustedBytes: 0, energy: 0 } },
    });

    const handler = await loadHandlerWithHttp(mockGet);
    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.skipped).toBe('Not enough info to get carbon data');
  });

  it('rejects when WebsiteCarbon serves a Cloudflare HTML challenge', async () => {
    const mockGet = makeGet({
      pageBody: Buffer.from('<html>Hello world</html>'),
      apiResponse: '<!DOCTYPE html><html></html>',
    });

    const handler = await loadHandlerWithHttp(mockGet);
    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('rejects when the upstream page fetch returns 4xx/5xx', async () => {
    const mockGet = makeGet({
      pageBody: { status: 503, data: Buffer.from('') },
      apiResponse: { statistics: { adjustedBytes: 1024, energy: 0.1 } },
    });

    const handler = await loadHandlerWithHttp(mockGet);
    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body.success).toBe(false);
  });

  it('rejects when the WebsiteCarbon API returns 4xx/5xx', async () => {
    const mockGet = makeGet({
      pageBody: Buffer.from('<html>Hello world</html>'),
      apiResponse: { status: 502, data: '' },
    });

    const handler = await loadHandlerWithHttp(mockGet);
    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body.success).toBe(false);
  });

  it('parses string JSON bodies that the shared http client did not auto-parse', async () => {
    // Defensive regression: depending on Content-Type the shared axios
    // instance may return a raw string. Ensure carbon.js handles that path.
    const mockGet = makeGet({
      pageBody: Buffer.from('<html>Hello world</html>'),
      apiResponse: JSON.stringify({ statistics: { adjustedBytes: 1024, energy: 0.1 } }),
    });

    const handler = await loadHandlerWithHttp(mockGet);
    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.statistics.adjustedBytes).toBe(1024);
  });

  it('normalises bare hostnames (http:// fallback regression)', async () => {
    // Follow-up to P0-6 / carbon.js: bare hostnames (or http://) used to
    // throw `ERR_INVALID_PROTOCOL` from `https.request`. With normalizeUrl
    // the handler should not throw before reaching the http client.
    const mockGet = jest.fn(async (url) => {
      if (url.includes('websitecarbon')) {
        return { status: 200, data: { statistics: { adjustedBytes: 100, energy: 0.01 } } };
      }
      // Confirm the URL we received is a valid https:// url, NOT the bare
      // hostname we passed in.
      expect(url.startsWith('https://')).toBe(true);
      return { status: 200, data: Buffer.from('<html></html>') };
    });

    const handler = await loadHandlerWithHttp(mockGet);
    // Pass a bare hostname; middleware normalises before handler sees it,
    // but if invoked directly (legacy) the handler still wraps with https://.
    const response = await invokeHandler(handler, 'example.com');
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(new Map([['carbon', (_req, res) => res.status(200).json({ ok: true })]]));

    const response = await request(app).get('/api/scan/carbon');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('carbon')).toBe(true);
  });
});
