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
  const { handler } = await import('../social-tags.js');
  return handler;
}

async function invokeHandler(handler, url = 'example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('social-tags module', () => {
  afterEach(() => {
    setModulesForTest(new Map());
  });

  it('returns parsed metadata on success', async () => {
    const handler = await loadHandlerWithAxios(
      jest.fn().mockResolvedValue({
        data: `
          <html>
            <head>
              <title>Example</title>
              <meta name="description" content="Example description" />
              <meta property="og:title" content="OG Example" />
              <meta name="twitter:card" content="summary_large_image" />
            </head>
          </html>
        `,
      })
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    const data = response.body.data;
    expect(data.title).toBe('Example');
    expect(data.description).toBe('Example description');
    expect(data.ogTitle).toBe('OG Example');
    expect(data.twitterCard).toBe('summary_large_image');
  });

  it('returns null-ish metadata fields gracefully when tags are absent', async () => {
    const handler = await loadHandlerWithAxios(
      jest.fn().mockResolvedValue({
        data: '<html><head><title></title></head><body>No metadata</body></html>',
      })
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        title: '',
        description: undefined,
        ogTitle: undefined,
      })
    );
  });

  it('returns an error envelope when fetching fails', async () => {
    const handler = await loadHandlerWithAxios(
      jest.fn().mockRejectedValue(new Error('network down'))
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Failed fetching data');
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(new Map([['social-tags', (_req, res) => res.status(200).json({ ok: true })]]));

    const response = await request(app).get('/api/scan/social-tags');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('social-tags')).toBe(true);
  });
});
