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

function createHttpsMock(strategy) {
  // strategy: (type, providerIndex, callIndex) => { raw?, requestError?, timeout? }
  const callsByType = {};
  let totalCalls = 0;

  class FakeAgent {
    constructor(options) {
      this.options = options || {};
    }
  }

  function mockRequest(options, callback) {
    const path = options && options.path ? String(options.path) : '';
    const typeMatch = path.match(/type=([A-Z]+)/);
    const type = typeMatch ? typeMatch[1] : 'UNKNOWN';
    const providerIndex = (callsByType[type] || 0);
    callsByType[type] = providerIndex + 1;
    const entry = strategy(type, providerIndex, totalCalls++) || { raw: '{}' };

    let dataHandler = () => {};
    let endHandler = () => {};

    const response = {
      on(event, handler) {
        if (event === 'data') dataHandler = handler;
        if (event === 'end') endHandler = handler;
        return response;
      },
    };

    const reqHandlers = { timeout: [], error: [] };

    const req = {
      on(event, handler) {
        if (reqHandlers[event]) reqHandlers[event].push(handler);
        return req;
      },
      destroy(error) {
        (reqHandlers.error || []).forEach((h) => h(error));
      },
      end() {
        process.nextTick(() => {
          if (entry.timeout) {
            (reqHandlers.timeout || []).forEach((h) => h());
            return;
          }
          if (entry.requestError) {
            (reqHandlers.error || []).forEach((h) => h(entry.requestError));
            return;
          }
          callback(response);
          dataHandler(entry.raw ?? '{}');
          endHandler();
        });
      },
    };

    return req;
  }

  return {
    default: {
      request: jest.fn(mockRequest),
      Agent: FakeAgent,
    },
    Agent: FakeAgent,
    request: jest.fn(mockRequest),
  };
}

async function loadHandlerWithHttps(strategy) {
  jest.resetModules();
  await jest.unstable_mockModule('https', () => createHttpsMock(strategy));
  const { handler } = await import('../dnssec.js');
  return handler;
}

async function invokeHandler(handler, url = 'example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('dnssec module', () => {
  beforeEach(() => {
    setModulesForTest(new Map());
  });

  it('returns DNSSEC records when Google DNS resolves answers', async () => {
    const successPayload = (recordValue) => ({
      raw: JSON.stringify({ Answer: [{ data: recordValue }] }),
    });
    const handler = await loadHandlerWithHttps((type) => {
      if (type === 'DNSKEY') return successPayload('dnskey-record');
      if (type === 'DS') return successPayload('ds-record');
      if (type === 'RRSIG') return successPayload('rrsig-record');
      return { raw: '{}' };
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.DNSKEY.isFound).toBe(true);
    expect(response.body.data.DS.isFound).toBe(true);
    expect(response.body.data.RRSIG.isFound).toBe(true);
    expect(response.body.data.DNSKEY.answer[0].data).toBe('dnskey-record');
  });

  it('returns not-found results when records are absent', async () => {
    const handler = await loadHandlerWithHttps(() => ({ raw: '{}' }));

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.DNSKEY.isFound).toBe(false);
    expect(response.body.data.DS.isFound).toBe(false);
    expect(response.body.data.RRSIG.isFound).toBe(false);
  });

  it('records per-type errors but still resolves when at least one type succeeds (allSettled)', async () => {
    // DNSKEY fails on both DOH providers; DS/RRSIG succeed on the first try.
    const handler = await loadHandlerWithHttps((type) => {
      if (type === 'DNSKEY') return { raw: 'invalid-json' };
      if (type === 'DS') return { raw: JSON.stringify({ Answer: [{ data: 'ds' }] }) };
      if (type === 'RRSIG') return { raw: JSON.stringify({ Answer: [{ data: 'rrsig' }] }) };
      return { raw: '{}' };
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.DNSKEY.isFound).toBe(false);
    expect(response.body.data.DNSKEY.error).toBeTruthy();
    expect(response.body.data.DS.isFound).toBe(true);
    expect(response.body.data.RRSIG.isFound).toBe(true);
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(
      new Map([
        [
          'dnssec',
          (_req, res) => res.status(200).json({ ok: true }),
        ],
      ])
    );

    const response = await request(app).get('/api/scan/dnssec');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('dnssec')).toBe(true);
  });
});
