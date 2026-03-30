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

function createNetMock(portBehaviors) {
  class FakeSocket {
    constructor() {
      this.handlers = {};
    }

    setTimeout() {}

    once(event, handler) {
      this.handlers[event] = handler;
      return this;
    }

    destroy() {}

    connect(port) {
      const behavior = portBehaviors[port] ?? 'error';
      process.nextTick(() => {
        if (behavior === 'connect') {
          this.handlers.connect?.();
          return;
        }

        if (behavior === 'timeout') {
          this.handlers.timeout?.();
          return;
        }

        this.handlers.error?.(new Error(`Connection failed for ${port}`));
      });
    }
  }

  return {
    default: {
      Socket: FakeSocket,
    },
  };
}

async function loadHandlerWithNet(portBehaviors) {
  jest.resetModules();
  process.env.PORTS_TO_CHECK = '80,443,8080';
  await jest.unstable_mockModule('net', () => createNetMock(portBehaviors));
  const { handler } = await import('../ports.js');
  return handler;
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('ports module', () => {
  beforeEach(() => {
    setModulesForTest(new Map());
    process.env.PORTS_TO_CHECK = '80,443,8080';
  });

  it('returns sorted open and failed ports', async () => {
    const handler = await loadHandlerWithNet({
      80: 'connect',
      443: 'connect',
      8080: 'error',
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.openPorts).toEqual(['80', '443']);
    expect(response.body.failedPorts).toEqual(['8080']);
  });

  it('returns all checked ports as failed when nothing is open', async () => {
    const handler = await loadHandlerWithNet({
      80: 'error',
      443: 'timeout',
      8080: 'error',
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.openPorts).toEqual([]);
    expect(response.body.failedPorts).toEqual(['80', '443', '8080']);
  });

  it('can surface a route-level failure payload', async () => {
    setModulesForTest(
      new Map([
        [
          'ports',
          (_req, res) => res.status(500).json({ error: 'scan failed' }),
        ],
      ])
    );

    const response = await request(app)
      .get('/api/scan/ports')
      .query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(500);
    expect(response.body.error).toBe('scan failed');
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(
      new Map([
        [
          'ports',
          (_req, res) => res.status(200).json({ ok: true }),
        ],
      ])
    );

    const response = await request(app).get('/api/scan/ports');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('ports')).toBe(true);
  });
});
