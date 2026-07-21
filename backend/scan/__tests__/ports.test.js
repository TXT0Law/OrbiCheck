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
    expect(response.body.success).toBe(true);
    const data = response.body.data;
    expect(data.openPorts).toHaveLength(1);
    expect(data.openPorts[0].port).toBe(80);
    expect(data.openPorts[0].banner).toContain('nginx/1.27');
    expect(data.openPorts[0].reason).toBe('syn-ack');
    expect(data.closedPorts).toEqual([{ port: 443, reason: 'conn-refused' }]);
    expect(data.filteredPorts).toEqual([{ port: 8080, reason: 'no-response' }]);
    expect(data.hostStatus).toEqual(
      expect.objectContaining({ up: true, method: 'tcp-connect' })
    );
    expect(data.scanSummary).toEqual(
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
    const data = response.body.data;
    expect(data.openPorts).toEqual([{ port: 80, banner: '', reason: 'syn-ack' }]);
    expect(data.closedPorts).toEqual([{ port: 443, reason: 'conn-refused' }]);
    expect(data.filteredPorts).toEqual([{ port: 8080, reason: 'no-response' }]);
  });

  it('maps reason field for connect, refusal, and timeout states', async () => {
    const { handler } = await loadHandlerWithNet({
      80: { dataOnWrite: 'HTTP/1.1 200 OK\r\nServer: nginx\r\n\r\n' },
      443: { errorCode: 'ECONNREFUSED' },
      8080: { errorCode: 'ETIMEDOUT' },
    });

    const response = await invokeHandler(handler);

    const data = response.body.data;
    expect(data.openPorts[0].reason).toBe('syn-ack');
    expect(data.closedPorts[0].reason).toBe('conn-refused');
    expect(data.filteredPorts[0].reason).toBe('no-response');
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
        body: JSON.stringify({
          target: 'example.com',
          profile: 'quick',
          authorization_acknowledged: true,
        }),
      })
    );
    const data = response.body.data;
    expect(data.engine).toBe('nmap');
    expect(data.profile).toBe('deep');
    expect(data.openPorts[0].version).toBe('Apache httpd 2.4.58');
    expect(data.openPorts[0].scripts).toEqual({ 'http-title': 'Example' });
    expect(data.startTime).toBe('2026-04-08T00:00:00.000Z');
    expect(data.endTime).toBe('2026-04-08T00:00:09.000Z');
    expect(data.hostStatus).toEqual({ up: true, latency: 123, method: 'tcp-connect' });
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
    const data = response.body.data;
    expect(data.behindProxy).toBe(true);
    expect(data.proxyProvider).toBe('Cloudflare');
    expect(data.note).toContain('behind a CDN/proxy');
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

    const quickData = quickResponse.body.data;
    const standardData = standardResponse.body.data;
    const quickTotal = quickData.openPorts.length
      + quickData.closedPorts.length
      + quickData.filteredPorts.length;
    const standardTotal = standardData.openPorts.length
      + standardData.closedPorts.length
      + standardData.filteredPorts.length;

    expect(quickData.profile).toBe('quick');
    expect(standardData.profile).toBe('standard');
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

  // P2-3 regressions ------------------------------------------------------
  it('falls back to native scan with a logged warning when nmap scanner errors', async () => {
    process.env.NMAP_SCANNER_URL = 'http://scanner:5000';
    process.env.PORTS_TO_CHECK = '80,443,8080';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: 'scanner offline' }),
    });

    const warnSpy = jest.fn();
    jest.resetModules();
    await jest.unstable_mockModule('../_common/logger.js', () => ({
      logger: { warn: warnSpy, info: () => {}, error: () => {}, debug: () => {}, child: () => ({ warn: warnSpy, info: () => {}, error: () => {}, debug: () => {} }) },
    }));
    await jest.unstable_mockModule('net', () => createNetMock({
      80: { dataOnWrite: 'HTTP/1.1 200 OK\r\nServer: nginx\r\n\r\n' },
      443: { errorCode: 'ECONNREFUSED' },
      8080: { errorCode: 'ECONNREFUSED' },
    }));
    const { handler } = await import('../ports.js');
    const response = await invokeHandler(handler, 'https://example.com');

    expect(response.statusCode).toBe(200);
    expect(response.body.data.engine).toBe('native');
    const fallbackWarnings = warnSpy.mock.calls.filter(([meta]) =>
      typeof meta === 'object' && meta !== null && 'error' in meta,
    );
    expect(fallbackWarnings.length).toBeGreaterThan(0);
  });

  it('does not contain the misleading legacy "function timed out" string in source', async () => {
    // Regression for P2-3: the previous implementation rewrote *every* error
    // (including nmap fallback failures) to "The function timed out before
    // completing." which masked the real root cause. Make sure that string
    // is not reintroduced.
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(dir, '..', 'ports.js'), 'utf8');
    expect(source).not.toMatch(/function timed out before completing/i);
  });

  it('warns when PORTS_TO_CHECK env shadows an explicit profile', async () => {
    process.env.PORTS_TO_CHECK = '80,443';
    const warnSpy = jest.fn();
    jest.resetModules();
    await jest.unstable_mockModule('../_common/logger.js', () => ({
      logger: { warn: warnSpy, info: () => {}, error: () => {}, debug: () => {} },
    }));
    await jest.unstable_mockModule('net', () => createNetMock({}));
    const { getPortsForProfile } = await import('../ports.js');

    getPortsForProfile('deep');

    const overrideWarning = warnSpy.mock.calls.find(([_meta, msg]) =>
      typeof msg === 'string' && msg.includes('overrides scan profile'),
    );
    expect(overrideWarning).toBeDefined();
  });
});
