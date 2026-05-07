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

function createWithBrowserContextMock({ clientCookies = [], browserError = null }) {
  const fakeContext = {
    cookies: jest.fn().mockResolvedValue(clientCookies),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const fakePage = {
    goto: jest.fn().mockImplementation(async () => {
      if (browserError) throw browserError;
    }),
    isClosed: () => false,
    close: jest.fn().mockResolvedValue(undefined),
  };
  return jest.fn(async (fn) => fn(fakeContext, fakePage));
}

async function loadHandlerWithMocks({ axiosResult, axiosError, clientCookies, browserError }) {
  jest.resetModules();

  // The cookies.js module now uses _common/http.js (which validateStatus =>
  // any). To preserve the original test for "request failed with status",
  // map an `axiosError` with `error.response.status` into a fake successful
  // resolution with that status code (since http never throws on HTTP 4xx).
  const httpGetMock = (() => {
    if (axiosError) {
      const status = axiosError?.response?.status;
      if (status) {
        return jest.fn().mockResolvedValue({ status, headers: {} });
      }
      return jest.fn().mockRejectedValue(axiosError);
    }
    return jest.fn().mockResolvedValue({ ...axiosResult, status: axiosResult?.status || 200 });
  })();
  await jest.unstable_mockModule('../_common/http.js', () => ({
    http: { get: httpGetMock },
    httpWith: () => ({ get: httpGetMock }),
    HTTP_DEFAULT_TIMEOUT_MS: 1000,
  }));

  await jest.unstable_mockModule('../_common/playwright-browser.js', () => ({
    withBrowserContext: createWithBrowserContextMock({ clientCookies, browserError }),
    launchChromium: jest.fn(),
    closeSharedBrowser: jest.fn(),
    __resetBrowserSingletonForTests: jest.fn(),
    BROWSER_MAX_CONTEXTS: 3,
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
    expect(response.body.success).toBe(true);
    const data = response.body.data;
    expect(data.headerCookies).toEqual(['session=abc; HttpOnly']);
    expect(data.clientCookies).toHaveLength(1);
    expect(data.clientCookies[0].name).toBe('session');
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
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({ skipped: 'No cookies' });
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
    // cookies.js explicitly returns `{ error: '...' }` rather than throwing,
    // so the envelope's `data` carries the error string. After P1-2 the
    // module no longer surfaces the original axios error message; it
    // detects 4xx/5xx via `response.status` from the shared http instance.
    expect(response.body.success).toBe(true);
    expect(response.body.data.error).toContain('Request failed with status 500');
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
    expect(response.body.success).toBe(true);
    expect(response.body.data.headerCookies).toEqual(['lang=en; Path=/']);
    expect(response.body.data.clientCookies).toBeNull();
  });

  it('returns skipped when axios returns no set-cookie and browser throws', async () => {
    const handler = await loadHandlerWithMocks({
      axiosResult: { headers: {} },
      clientCookies: [],
      browserError: new Error('launch failed'),
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({ skipped: 'No cookies' });
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('cookies')).toBe(true);
  });
});
