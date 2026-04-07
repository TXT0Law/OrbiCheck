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

function createBrowserMock({ clientCookies = [], browserError = null }) {
  return {
    newContext: jest.fn().mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        goto: jest.fn().mockImplementation(async () => {
          if (browserError) throw browserError;
        }),
      }),
      cookies: jest.fn().mockResolvedValue(clientCookies),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

async function loadHandlerWithMocks({ axiosResult, axiosError, clientCookies, browserError }) {
  jest.resetModules();

  await jest.unstable_mockModule('axios', () => ({
    default: {
      get: axiosError
        ? jest.fn().mockRejectedValue(axiosError)
        : jest.fn().mockResolvedValue(axiosResult),
    },
  }));

  const browserMock = createBrowserMock({ clientCookies, browserError });
  await jest.unstable_mockModule('../_common/playwright-browser.js', () => ({
    launchChromium: jest.fn().mockResolvedValue(browserMock),
  }));

  const { handler } = await import('../cookies.js');
  return handler;
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('cookies module', () => {
  beforeEach(() => {
    setModulesForTest(new Map());
  });

  it('returns both header and browser cookies on success', async () => {
    const handler = await loadHandlerWithMocks({
      axiosResult: {
        headers: {
          'set-cookie': ['session=abc; HttpOnly'],
        },
      },
      clientCookies: [{ name: 'session', value: 'abc', domain: 'example.com' }],
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.headerCookies).toEqual(['session=abc; HttpOnly']);
    expect(response.body.clientCookies).toHaveLength(1);
    expect(response.body.clientCookies[0].name).toBe('session');
  });

  it('returns skipped when neither header nor browser cookies exist', async () => {
    const handler = await loadHandlerWithMocks({
      axiosResult: {
        headers: {},
      },
      clientCookies: [],
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ skipped: 'No cookies' });
  });

  it('returns an error object when the HTTP request fails', async () => {
    const handler = await loadHandlerWithMocks({
      axiosError: {
        response: { status: 500 },
        message: 'upstream failure',
      },
      clientCookies: [],
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.error).toContain('Request failed with status 500');
    expect(response.body.error).toContain('upstream failure');
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(
      new Map([
        [
          'cookies',
          (_req, res) => res.status(200).json({ ok: true }),
        ],
      ])
    );

    const response = await request(app).get('/api/scan/cookies');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('falls back gracefully when Playwright browser fails', async () => {
    const handler = await loadHandlerWithMocks({
      axiosResult: {
        headers: {
          'set-cookie': ['lang=en; Path=/'],
        },
      },
      clientCookies: [],
      browserError: new Error('Chromium not found'),
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.headerCookies).toEqual(['lang=en; Path=/']);
    expect(response.body.clientCookies).toBeNull();
  });

  it('returns skipped when axios returns no set-cookie and browser throws', async () => {
    const handler = await loadHandlerWithMocks({
      axiosResult: { headers: {} },
      clientCookies: [],
      browserError: new Error('launch failed'),
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ skipped: 'No cookies' });
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('cookies')).toBe(true);
  });
});
