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

function createHttpsMock({ statusCode = 200, error = null }) {
  return {
    default: {
      get: jest.fn((_url, callback) => {
        let requestErrorHandler = () => {};
        let dataHandler = () => {};
        let endHandler = () => {};

        const response = {
          statusCode,
          on(event, handler) {
            if (event === 'data') {
              dataHandler = handler;
            }
            if (event === 'end') {
              endHandler = handler;
            }
            return response;
          },
        };

        const req = {
          on(event, handler) {
            if (event === 'error') {
              requestErrorHandler = handler;
            }
            return req;
          },
          end() {
            process.nextTick(() => {
              if (error) {
                requestErrorHandler(error);
                return;
              }

              callback(response);
              dataHandler('ok');
              endHandler();
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
  const { handler } = await import('../status.js');
  return handler;
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('status module', () => {
  beforeEach(() => {
    setModulesForTest(new Map());
  });

  it('returns uptime data for a successful response', async () => {
    const handler = await loadHandlerWithHttps({
      statusCode: 200,
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.isUp).toBe(true);
    expect(response.body.responseCode).toBe(200);
    expect(typeof response.body.responseTime).toBe('number');
  });

  it('treats an empty but successful response as up', async () => {
    const handler = await loadHandlerWithHttps({
      statusCode: 204,
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.isUp).toBe(true);
    expect(response.body.responseCode).toBe(204);
  });

  it('returns a generic error for non-success status codes', async () => {
    const handler = await loadHandlerWithHttps({
      statusCode: 500,
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: GENERIC_ERROR_MESSAGE });
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(
      new Map([
        [
          'status',
          (_req, res) => res.status(200).json({ ok: true }),
        ],
      ])
    );

    const response = await request(app).get('/api/scan/status');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('status')).toBe(true);
  });
});
