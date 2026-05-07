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

function createTlsMock({
  authorized = true,
  authorizationError = 'UNAUTHORIZED',
  peerCertificate = {
    subject: { CN: 'example.com' },
    issuer: { CN: 'Example CA' },
    valid_to: 'Jan 01 2030 GMT',
    raw: Buffer.from('certificate'),
    issuerCertificate: { subject: { CN: 'Root CA' } },
  },
  socketError = null,
  timeout = false,
}) {
  return {
    default: {
      connect: jest.fn((_options, onConnect) => {
        let timeoutHandler = () => {};
        let errorHandler = () => {};

        const socket = {
          authorized,
          authorizationError,
          getPeerCertificate: jest.fn(() => peerCertificate),
          end: jest.fn(),
          destroy: jest.fn(),
          setTimeout: jest.fn((_timeoutMs, handler) => {
            timeoutHandler = handler;
          }),
          on: jest.fn((event, handler) => {
            if (event === 'error') {
              errorHandler = handler;
            }
            return socket;
          }),
        };

        process.nextTick(() => {
          if (timeout) {
            timeoutHandler();
            return;
          }

          if (socketError) {
            errorHandler(socketError);
            return;
          }

          onConnect();
        });

        return socket;
      }),
    },
  };
}

async function loadHandlerWithTls(mockConfig) {
  jest.resetModules();
  await jest.unstable_mockModule('tls', () => createTlsMock(mockConfig));
  const { handler } = await import('../ssl.js');
  return handler;
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('ssl module', () => {
  beforeEach(() => {
    setModulesForTest(new Map());
  });

  it('returns certificate data when TLS handshake succeeds', async () => {
    const handler = await loadHandlerWithTls({});

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.subject.CN).toBe('example.com');
    expect(response.body.data.issuer.CN).toBe('Example CA');
    expect(response.body.data.raw).toBeUndefined();
    expect(response.body.data.issuerCertificate).toBeUndefined();
  });

  it('returns success false when the server presents no certificate', async () => {
    const handler = await loadHandlerWithTls({
      peerCertificate: {},
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.data).toEqual({});
    expect(response.body.error).toContain('No certificate presented');
  });

  it('returns success false when the TLS socket times out', async () => {
    const handler = await loadHandlerWithTls({
      timeout: true,
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('timed out');
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(
      new Map([
        [
          'ssl',
          (_req, res) => res.status(200).json({ ok: true }),
        ],
      ])
    );

    const response = await request(app).get('/api/scan/ssl');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('ssl')).toBe(true);
  });
});
