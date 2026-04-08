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

function createNetMock(portBehaviors = {}) {
  class FakeSocket {
    constructor() {
      this.handlers = {};
      this.behavior = null;
    }

    setTimeout() {}

    once(event, handler) {
      this.handlers[event] = handler;
      return this;
    }

    removeAllListeners() {
      this.handlers = {};
    }

    destroy() {}

    write(payload) {
      if (this.behavior?.dataOnWrite) {
        process.nextTick(() => {
          this.handlers.data?.(Buffer.from(this.behavior.dataOnWrite));
        });
      }
      this.lastWrite = payload;
    }

    connect(port) {
      const behavior = portBehaviors[port] ?? { errorCode: 'ECONNREFUSED' };
      this.behavior = behavior;
      process.nextTick(() => {
        if (behavior.timeoutBeforeConnect) {
          this.handlers.timeout?.();
          return;
        }

        if (behavior.errorCode) {
          const error = new Error(`Connection failed for ${port}`);
          error.code = behavior.errorCode;
          this.handlers.error?.(error);
          return;
        }

        this.handlers.connect?.();

        if (behavior.data) {
          process.nextTick(() => {
            this.handlers.data?.(Buffer.from(behavior.data));
          });
        }

        if (behavior.timeoutAfterConnect) {
          process.nextTick(() => {
            this.handlers.timeout?.();
          });
        }
      });
    }
  }

  return {
    default: {
      Socket: FakeSocket,
    },
  };
}

async function loadHandlerWithNet(portBehaviors, options = {}) {
  jest.resetModules();
  if (Object.prototype.hasOwnProperty.call(options, 'portsToCheck')) {
    process.env.PORTS_TO_CHECK = options.portsToCheck;
  } else {
    process.env.PORTS_TO_CHECK = '80,443,8080';
  }
  if (!options.preserveScannerEnv) {
    delete process.env.NMAP_SCANNER_URL;
  }
  await jest.unstable_mockModule('net', () => createNetMock(portBehaviors));
  return import('../ports.js');
}

async function invokeHandler(handler, url = 'https://example.com', scanOptions = {}) {
  const req = { query: { url }, body: { scanOptions } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('ports module', () => {
  beforeEach(() => {
    setModulesForTest(new Map());
    process.env.PORTS_TO_CHECK = '80,443,8080';
    delete process.env.NMAP_SCANNER_URL;
    global.fetch = undefined;
  });

  it('returns banner data and classifies open, closed, and filtered ports', async () => {
    const { handler } = await loadHandlerWithNet({
      80: { dataOnWrite: 'HTTP/1.1 200 OK\r\nServer: nginx/1.27\r\n\r\n' },
      443: { errorCode: 'ECONNREFUSED' },
      8080: { timeoutBeforeConnect: true },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.openPorts).toHaveLength(1);
    expect(response.body.openPorts[0].port).toBe(80);
    expect(response.body.openPorts[0].banner).toContain('nginx/1.27');
    expect(response.body.openPorts[0].reason).toBe('syn-ack');
    expect(response.body.closedPorts).toEqual([{ port: 443, reason: 'conn-refused' }]);
    expect(response.body.filteredPorts).toEqual([{ port: 8080, reason: 'no-response' }]);
    expect(response.body.hostStatus).toEqual(
      expect.objectContaining({ up: true, method: 'tcp-connect' })
    );
    expect(response.body.scanSummary).toEqual(
      expect.objectContaining({
        notShown: 'Not shown: 1 closed ports, 1 filtered ports.',
        closedCount: 1,
        filteredCount: 1,
        totalPortsScanned: 3,
      })
    );
  });

  it('keeps connected ports open when banner read times out', async () => {
    const { handler } = await loadHandlerWithNet({
      80: { timeoutAfterConnect: true },
      443: { errorCode: 'ECONNREFUSED' },
      8080: { errorCode: 'ETIMEDOUT' },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.openPorts).toEqual([{ port: 80, banner: '', reason: 'syn-ack' }]);
    expect(response.body.closedPorts).toEqual([{ port: 443, reason: 'conn-refused' }]);
    expect(response.body.filteredPorts).toEqual([{ port: 8080, reason: 'no-response' }]);
  });

  it('maps reason field for connect, refusal, and timeout states', async () => {
    const { handler } = await loadHandlerWithNet({
      80: { dataOnWrite: 'HTTP/1.1 200 OK\r\nServer: nginx\r\n\r\n' },
      443: { errorCode: 'ECONNREFUSED' },
      8080: { errorCode: 'ETIMEDOUT' },
    });

    const response = await invokeHandler(handler);

    expect(response.body.openPorts[0].reason).toBe('syn-ack');
    expect(response.body.closedPorts[0].reason).toBe('conn-refused');
    expect(response.body.filteredPorts[0].reason).toBe('no-response');
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

  it('delegates to nmap scanner when configured', async () => {
    process.env.NMAP_SCANNER_URL = 'http://scanner:5000';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        engine: 'nmap',
        profile: 'deep',
        method: 'nmap -sT -sV -sC -T3 -p-',
        duration_ms: 999,
        start_time: '2026-04-08T00:00:00.000Z',
        end_time: '2026-04-08T00:00:09.000Z',
        open_ports: [
          {
            port: 80,
            protocol: 'tcp',
            service: 'http',
            version: 'Apache httpd 2.4.58',
            banner: 'Apache httpd 2.4.58',
            reason: 'syn-ack',
            scripts: { 'http-title': 'Example' },
          },
        ],
        closed_ports: [{ port: 443, reason: 'conn-refused' }],
        filtered_ports: [{ port: 22, reason: 'no-response' }],
        detected_technologies: ['Apache httpd'],
        host_status: { up: true, latency: 123, method: 'tcp-connect' },
      }),
    });

    const { handler } = await loadHandlerWithNet({}, { preserveScannerEnv: true });
    const response = await invokeHandler(handler, 'https://example.com');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://scanner:5000/scan/ports',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ target: 'example.com', profile: 'quick' }),
      })
    );
    expect(response.body.engine).toBe('nmap');
    expect(response.body.profile).toBe('deep');
    expect(response.body.openPorts[0].version).toBe('Apache httpd 2.4.58');
    expect(response.body.openPorts[0].scripts).toEqual({ 'http-title': 'Example' });
    expect(response.body.startTime).toBe('2026-04-08T00:00:00.000Z');
    expect(response.body.endTime).toBe('2026-04-08T00:00:09.000Z');
    expect(response.body.hostStatus).toEqual({ up: true, latency: 123, method: 'tcp-connect' });
  });

  it('flags CDN-backed results when all scanned ports are open', async () => {
    const { handler } = await loadHandlerWithNet({
      80: {
        dataOnWrite: 'HTTP/1.1 400 Bad Request\r\nServer: cloudflare\r\nCF-RAY: abc123-HKG\r\n\r\n',
      },
      443: {
        dataOnWrite: 'HTTP/1.1 400 Bad Request\r\nServer: cloudflare\r\nCF-RAY: def456-HKG\r\n\r\n',
      },
      8080: {
        dataOnWrite: 'HTTP/1.1 403 Forbidden\r\nServer: cloudflare\r\nCF-RAY: ghi789-HKG\r\n\r\n',
      },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.behindProxy).toBe(true);
    expect(response.body.proxyProvider).toBe('Cloudflare');
    expect(response.body.note).toContain('behind a CDN/proxy');
  });

  it('uses fewer default ports for quick profile than standard profile', async () => {
    const { handler } = await loadHandlerWithNet({}, { portsToCheck: '' });

    const quickResponse = await invokeHandler(
      handler,
      'https://example.com',
      { portScanProfile: 'quick' }
    );
    const standardResponse = await invokeHandler(
      handler,
      'https://example.com',
      { portScanProfile: 'standard' }
    );

    const quickTotal = quickResponse.body.openPorts.length
      + quickResponse.body.closedPorts.length
      + quickResponse.body.filteredPorts.length;
    const standardTotal = standardResponse.body.openPorts.length
      + standardResponse.body.closedPorts.length
      + standardResponse.body.filteredPorts.length;

    expect(quickResponse.body.profile).toBe('quick');
    expect(standardResponse.body.profile).toBe('standard');
    expect(quickTotal).toBeLessThan(standardTotal);
  });

  it('formats long HTTP banners into a concise summary', async () => {
    const { formatBanner } = await loadHandlerWithNet({}, { portsToCheck: '' });

    const banner = formatBanner(
      'HTTP/1.1 400 Bad Request\r\nServer: cloudflare\r\nCF-RAY: 9e899571bf5220f3-HKG\r\nX-Powered-By: edge\r\n\r\n',
      443
    );

    expect(banner).toBe(
      'HTTP/1.1 400 Bad Request | Server: cloudflare | CF-RAY: 9e899571bf5220f3-HKG | X-POWERED-BY: edge'
    );
  });

  it('limits concurrent work in mapWithConcurrency', async () => {
    const { mapWithConcurrency, MAX_CONCURRENT } = await loadHandlerWithNet({}, { portsToCheck: '' });
    let activeCount = 0;
    let peakActiveCount = 0;

    const results = await mapWithConcurrency(
      Array.from({ length: MAX_CONCURRENT + 8 }, (_, index) => index),
      async (value) => {
        activeCount += 1;
        peakActiveCount = Math.max(peakActiveCount, activeCount);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeCount -= 1;
        return value * 2;
      },
      4
    );

    expect(peakActiveCount).toBeLessThanOrEqual(4);
    expect(results).toHaveLength(MAX_CONCURRENT + 8);
    expect(results[0]).toBe(0);
    expect(results.at(-1)).toBe((MAX_CONCURRENT + 7) * 2);
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
