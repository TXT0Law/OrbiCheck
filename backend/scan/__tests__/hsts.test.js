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

function createHttpsMock({ headers = {}, error = null }) {
  return {
    default: {
      request: jest.fn((_url, callback) => {
        let errorHandler = () => {};
        const req = {
          on(event, handler) {
            if (event === 'error') {
              errorHandler = handler;
            }
            return req;
          },
          end() {
            process.nextTick(() => {
              if (error) {
                errorHandler(error);
                return;
              }
              callback({ headers });
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

  it('returns compatible true for preload-ready HSTS headers', async () => {
    const handler = await loadHandlerWithHttps({
      headers: {
        'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
      },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.compatible).toBe(true);
    expect(response.body.hstsHeader).toContain('includeSubDomains');
    expect(response.body.hstsHeader).toContain('preload');
  });

  it('returns incompatible result when HSTS header is missing', async () => {
    const handler = await loadHandlerWithHttps({
      headers: {},
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.compatible).toBe(false);
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
});
