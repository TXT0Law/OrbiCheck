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

function createHttpsMock({ headers = {}, error = null, triggerTimeout = false }) {
  return {
    default: {
      request: jest.fn((_url, _opts, callback) => {
        let errorHandler = () => {};
        let timeoutHandler = () => {};
        const req = {
          on(event, handler) {
            if (event === 'error') {
              errorHandler = handler;
            }
            if (event === 'timeout') {
              timeoutHandler = handler;
            }
            return req;
          },
          end() {
            process.nextTick(() => {
              if (triggerTimeout) {
                timeoutHandler();
                return;
              }
              if (error) {
                errorHandler(error);
                return;
              }
              callback({ headers });
            });
          },
          destroy(err) {
            process.nextTick(() => {
              errorHandler(err);
            });
          },
        };
        return req;
      }),
    },
  };
}

async function loadHandlerWithHttps(mockConfig) {
  jest.resetModules();
  await jest.unstable_mockModule('https', () => createHttpsMock(mockConfig));
  const { handler } = await import('../hsts.js');
  return handler;
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('hsts module', () => {
  beforeEach(() => {
    setModulesForTest(new Map());
  });

  it('returns preloadReady true for preload-ready HSTS headers', async () => {
    const handler = await loadHandlerWithHttps({
      headers: {
        'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
      },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.enabled).toBe(true);
    expect(response.body.preloadReady).toBe(true);
    expect(response.body.includeSubDomains).toBe(true);
    expect(response.body.preload).toBe(true);
    expect(response.body.maxAge).toBe(31536000);
    expect(response.body.hstsHeader).toContain('includeSubDomains');
    expect(response.body.hstsHeader).toContain('preload');
  });

  it('returns result when HSTS header is missing', async () => {
    const handler = await loadHandlerWithHttps({
      headers: {},
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.enabled).toBe(false);
    expect(response.body.preloadReady).toBe(false);
    expect(response.body.message).toContain('does not serve any HSTS headers');
    expect(response.body.hstsHeader).toBeNull();
  });

  it('returns a 500 payload when the HTTPS request fails', async () => {
    const handler = await loadHandlerWithHttps({
      error: new Error('socket hang up'),
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body).toBe(JSON.stringify({ error: 'Error making request: socket hang up' }));
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(
      new Map([
        [
          'hsts',
          (_req, res) => res.status(200).json({ ok: true }),
        ],
      ])
    );

    const response = await request(app).get('/api/scan/hsts');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('hsts')).toBe(true);
  });

  it('handles lowercase directives (GitHub regression)', async () => {
    const handler = await loadHandlerWithHttps({
      headers: {
        'strict-transport-security': 'max-age=31536000; includesubdomains; preload',
      },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.enabled).toBe(true);
    expect(response.body.preloadReady).toBe(true);
    expect(response.body.includeSubDomains).toBe(true);
    expect(response.body.preload).toBe(true);
    expect(response.body.maxAge).toBe(31536000);
    expect(response.body.hstsHeader).toContain('includesubdomains');
  });

  it('reports enabled but not preloadReady for sub-threshold max-age', async () => {
    const handler = await loadHandlerWithHttps({
      headers: {
        'strict-transport-security': 'max-age=300',
      },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.enabled).toBe(true);
    expect(response.body.preloadReady).toBe(false);
    expect(response.body.maxAge).toBe(300);
    expect(response.body.hstsHeader).toBe('max-age=300');
  });

  it('handles quoted max-age and extra whitespace', async () => {
    const handler = await loadHandlerWithHttps({
      headers: {
        'strict-transport-security': 'max-age = "63072000"; includeSubDomains',
      },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.enabled).toBe(true);
    expect(response.body.maxAge).toBe(63072000);
    expect(response.body.includeSubDomains).toBe(true);
    expect(response.body.preloadReady).toBe(false);
  });

  it('returns error payload on request timeout', async () => {
    const handler = await loadHandlerWithHttps({
      triggerTimeout: true,
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body).toBe(JSON.stringify({ error: 'Error making request: Request timed out' }));
  });
});
