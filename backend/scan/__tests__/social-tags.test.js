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
    expect(response.body.title).toBe('Example');
    expect(response.body.description).toBe('Example description');
    expect(response.body.ogTitle).toBe('OG Example');
    expect(response.body.twitterCard).toBe('summary_large_image');
  });

  it('returns null-ish metadata fields gracefully when tags are absent', async () => {
    const handler = await loadHandlerWithAxios(
      jest.fn().mockResolvedValue({
        data: '<html><head><title></title></head><body>No metadata</body></html>',
      })
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        title: '',
        description: undefined,
        ogTitle: undefined,
      })
    );
  });

  it('returns a 500 status payload when fetching fails', async () => {
    const handler = await loadHandlerWithAxios(
      jest.fn().mockRejectedValue(new Error('network down'))
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body).toBe(JSON.stringify({ error: 'Failed fetching data' }));
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
