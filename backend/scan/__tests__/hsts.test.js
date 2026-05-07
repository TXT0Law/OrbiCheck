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

/**
 * Build a fake `https` module that drives a deterministic outcome per call.
 * The mock supports multiple sequential outcomes so that we can simulate a
 * HEAD → GET fallback in the same test.
 */
function createHttpsMock(outcomes) {
  const queue = Array.isArray(outcomes) ? [...outcomes] : [outcomes];
  const requestSpy = jest.fn((_url, opts, callback) => {
    const outcome = queue.shift() ?? queue[queue.length - 1] ?? { kind: 'response', headers: {} };
    let errorHandler = () => {};
    let timeoutHandler = () => {};
    const req = {
      on(event, handler) {
        if (event === 'error') errorHandler = handler;
        if (event === 'timeout') timeoutHandler = handler;
        return req;
      },
      end() {
        process.nextTick(() => {
          if (outcome.kind === 'timeout') {
            timeoutHandler();
            return;
          }
          if (outcome.kind === 'error') {
            errorHandler(outcome.error);
            return;
          }
          callback({
            statusCode: outcome.statusCode ?? 200,
            headers: outcome.headers ?? {},
            resume() {},
          });
        });
      },
      destroy(err) {
        if (err) {
          process.nextTick(() => errorHandler(err));
        }
      },
    };
    requestSpy.mock.requestOpts ??= [];
    requestSpy.mock.requestOpts.push(opts);
    return req;
  });
  return {
    default: { request: requestSpy },
    requestSpy,
  };
}

async function loadHandlerWithHttps(outcomes) {
  jest.resetModules();
  const mock = createHttpsMock(outcomes);
  await jest.unstable_mockModule('https', () => ({ default: mock.default }));
  const { handler } = await import('../hsts.js');
  return { handler, requestSpy: mock.requestSpy };
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
    const { handler } = await loadHandlerWithHttps({
      kind: 'response',
      statusCode: 200,
      headers: { 'strict-transport-security': 'max-age=31536000; includeSubDomains; preload' },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    const data = response.body.data;
    expect(data.enabled).toBe(true);
    expect(data.preloadReady).toBe(true);
    expect(data.includeSubDomains).toBe(true);
    expect(data.preload).toBe(true);
    expect(data.maxAge).toBe(31536000);
  });

  it('returns a no-header result when HSTS header is missing', async () => {
    const { handler } = await loadHandlerWithHttps({
      kind: 'response',
      statusCode: 200,
      headers: {},
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    const data = response.body.data;
    expect(data.enabled).toBe(false);
    expect(data.preloadReady).toBe(false);
    expect(data.message).toContain('does not serve any HSTS headers');
    expect(data.hstsHeader).toBeNull();
  });

  it('returns an error envelope when the HTTPS request fails', async () => {
    const { handler } = await loadHandlerWithHttps({
      kind: 'error',
      error: new Error('socket hang up'),
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('socket hang up');
  });

  it('resolves with a 408 timeout payload when the request times out (regression: must not hang)', async () => {
    const { handler } = await loadHandlerWithHttps({ kind: 'timeout' });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(408);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toMatch(/timed out|timed-out/i);
  });

  it('handles lowercase directives (GitHub regression)', async () => {
    const { handler } = await loadHandlerWithHttps({
      kind: 'response',
      headers: { 'strict-transport-security': 'max-age=31536000; includesubdomains; preload' },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    const data = response.body.data;
    expect(data.preloadReady).toBe(true);
    expect(data.includeSubDomains).toBe(true);
    expect(data.preload).toBe(true);
  });

  it('reports enabled but not preloadReady for sub-threshold max-age', async () => {
    const { handler } = await loadHandlerWithHttps({
      kind: 'response',
      headers: { 'strict-transport-security': 'max-age=300' },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    const data = response.body.data;
    expect(data.enabled).toBe(true);
    expect(data.preloadReady).toBe(false);
    expect(data.maxAge).toBe(300);
  });

  it('handles quoted max-age and extra whitespace', async () => {
    const { handler } = await loadHandlerWithHttps({
      kind: 'response',
      headers: { 'strict-transport-security': 'max-age = "63072000"; includeSubDomains' },
    });

    const response = await invokeHandler(handler);

    expect(response.body.success).toBe(true);
    expect(response.body.data.maxAge).toBe(63072000);
    expect(response.body.data.includeSubDomains).toBe(true);
  });

  it('falls back from HEAD to GET when the origin rejects HEAD with 405', async () => {
    const { handler, requestSpy } = await loadHandlerWithHttps([
      { kind: 'response', statusCode: 405, headers: {} },
      {
        kind: 'response',
        statusCode: 200,
        headers: { 'strict-transport-security': 'max-age=31536000' },
      },
    ]);

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.enabled).toBe(true);
    expect(requestSpy).toHaveBeenCalledTimes(2);
    expect(requestSpy.mock.requestOpts[0].method).toBe('HEAD');
    expect(requestSpy.mock.requestOpts[1].method).toBe('GET');
  });

  it('normalises http URLs to https before requesting', async () => {
    const { handler, requestSpy } = await loadHandlerWithHttps({
      kind: 'response',
      statusCode: 200,
      headers: {},
    });

    await invokeHandler(handler, 'http://example.com');

    expect(requestSpy).toHaveBeenCalledTimes(1);
    const requestedUrl = requestSpy.mock.calls[0][0];
    expect(requestedUrl).toMatch(/^https:\/\//);
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(
      new Map([
        ['hsts', (_req, res) => res.status(200).json({ ok: true })],
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
