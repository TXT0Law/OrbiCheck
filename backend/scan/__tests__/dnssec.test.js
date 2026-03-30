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

function createHttpsMock(sequence) {
  let callIndex = 0;

  return {
    default: {
      request: jest.fn((_options, callback) => {
        const entry = sequence[callIndex++] ?? { raw: '{}' };
        let dataHandler = () => {};
        let endHandler = () => {};
        let responseErrorHandler = () => {};

        const response = {
          on(event, handler) {
            if (event === 'data') {
              dataHandler = handler;
            }
            if (event === 'end') {
              endHandler = handler;
            }
            if (event === 'error') {
              responseErrorHandler = handler;
            }
            return response;
          },
        };

        return {
          end() {
            process.nextTick(() => {
              callback(response);

              if (entry.responseError) {
                responseErrorHandler(entry.responseError);
                return;
              }

              dataHandler(entry.raw ?? '{}');
              endHandler();
            });
          },
        };
      }),
    },
  };
}

async function loadHandlerWithHttps(sequence) {
  jest.resetModules();
  await jest.unstable_mockModule('https', () => createHttpsMock(sequence));
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
    const handler = await loadHandlerWithHttps([
      { raw: JSON.stringify({ Answer: [{ data: 'dnskey-record' }] }) },
      { raw: JSON.stringify({ Answer: [{ data: 'ds-record' }] }) },
      { raw: JSON.stringify({ Answer: [{ data: 'rrsig-record' }] }) },
    ]);

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.DNSKEY.isFound).toBe(true);
    expect(response.body.DS.isFound).toBe(true);
    expect(response.body.RRSIG.isFound).toBe(true);
    expect(response.body.DNSKEY.answer[0].data).toBe('dnskey-record');
  });

  it('returns not-found results when records are absent', async () => {
    const handler = await loadHandlerWithHttps([
      { raw: JSON.stringify({}) },
      { raw: JSON.stringify({}) },
      { raw: JSON.stringify({}) },
    ]);

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.DNSKEY.isFound).toBe(false);
    expect(response.body.DS.isFound).toBe(false);
    expect(response.body.RRSIG.isFound).toBe(false);
  });

  it('returns a generic error when a DNS response is invalid JSON', async () => {
    const handler = await loadHandlerWithHttps([
      { raw: 'not-json' },
    ]);

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: GENERIC_ERROR_MESSAGE });
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
