import { EventEmitter } from 'events';
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

function createRequestAndResponse({ statusCode = 200, body = null, error = null }) {
  const requestEmitter = new EventEmitter();
  process.nextTick(() => {
    if (error) {
      requestEmitter.emit('error', error);
      return;
    }
    const response = new EventEmitter();
    response.statusCode = statusCode;
    if (body !== null) {
      process.nextTick(() => {
        response.emit('data', body);
        response.emit('end');
      });
    }
    requestEmitter.callback(response);
  });
  requestEmitter.on = function on(event, listener) {
    EventEmitter.prototype.on.call(this, event, listener);
    return this;
  };
  return requestEmitter;
}

async function loadHandlerWithRedirects(getImplementation) {
  jest.resetModules();
  await jest.unstable_mockModule('follow-redirects', () => ({
    default: {
      https: { get: getImplementation },
    },
  }));
  const { handler } = await import('../security-txt.js');
  return handler;
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('security-txt module', () => {
  afterEach(() => {
    setModulesForTest(new Map());
  });

  it('returns parsed security.txt fields on success', async () => {
    const httpsGet = jest.fn((url, callback) => {
      const requestEmitter = createRequestAndResponse({
        statusCode: 200,
        body: [
          'Contact: mailto:security@example.com',
          'Contact: https://example.com/security',
          'Expires: 2027-01-01T00:00:00.000Z',
          '-----BEGIN PGP SIGNED MESSAGE-----',
        ].join('\n'),
      });
      requestEmitter.callback = callback;
      return requestEmitter;
    });

    const handler = await loadHandlerWithRedirects(httpsGet);
    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    const data = response.body.data;
    expect(data.isPresent).toBe(true);
    expect(data.isPgpSigned).toBe(true);
    expect(data.fields.Contact).toBe('mailto:security@example.com');
    expect(data.fields.Contact1).toBe('https://example.com/security');
  });

  it('returns not present when both security.txt paths are missing', async () => {
    const httpsGet = jest.fn((url, callback) => {
      const requestEmitter = createRequestAndResponse({ statusCode: 404 });
      requestEmitter.callback = callback;
      return requestEmitter;
    });

    const handler = await loadHandlerWithRedirects(httpsGet);
    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({ isPresent: false });
    expect(httpsGet).toHaveBeenCalledTimes(2);
  });

  it('returns a generic error envelope when fetching security.txt fails', async () => {
    const httpsGet = jest.fn((url, callback) => {
      const requestEmitter = createRequestAndResponse({
        error: new Error('redirect failed'),
      });
      requestEmitter.callback = callback;
      return requestEmitter;
    });

    const handler = await loadHandlerWithRedirects(httpsGet);
    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(new Map([['security-txt', (_req, res) => res.status(200).json({ ok: true })]]));

    const response = await request(app).get('/api/scan/security-txt');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('security-txt')).toBe(true);
  });
});
