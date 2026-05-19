import http from 'http';
import { jest } from '@jest/globals';
import request from 'supertest';

const DEGRADED_WINDOW_MS = 5000;
const RECOVERY_WAIT_MS = DEGRADED_WINDOW_MS + 250;
const CIRCUIT_COOLDOWN_MS = 1000;
const QUICK_MODULES = [
  'status',
  'headers',
  'robots-txt',
  'security-txt',
  'page-source',
  'social-tags',
  'hsts',
  'http-security',
  'redirects',
  'sitemap',
];

function startDegradedServer() {
  let calls = 0;
  let healthy = false;
  const timer = setTimeout(() => {
    healthy = true;
  }, DEGRADED_WINDOW_MS);
  const server = http.createServer((_req, res) => {
    calls += 1;
    if (!healthy) {
      res.writeHead(503, { 'content-type': 'text/plain' });
      res.end('temporarily unavailable');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/`,
        getCalls: () => calls,
        close: () => new Promise((resolve) => {
          clearTimeout(timer);
          server.close(resolve);
        }),
      });
    });
  });
}

describe('degraded target integration', () => {
  let app;
  let setModulesForTest;
  let statusHandler;

  beforeEach(async () => {
    process.env.SCAN_CIRCUIT_BREAKER_COOLDOWN_MS = String(CIRCUIT_COOLDOWN_MS);
    process.env.SCAN_CIRCUIT_BREAKER_HALF_OPEN_PROBES = String(QUICK_MODULES.length);
    jest.resetModules();
    ({ app, setModulesForTest } = await import('../server.js'));
    ({ handler: statusHandler } = await import('../status.js'));
    setModulesForTest(new Map(QUICK_MODULES.map((name) => [name, statusHandler])));
  });

  afterEach(() => {
    delete process.env.SCAN_CIRCUIT_BREAKER_COOLDOWN_MS;
    delete process.env.SCAN_CIRCUIT_BREAKER_HALF_OPEN_PROBES;
    delete process.env.SCAN_HOST_CONCURRENCY;
  });

  it('keeps degraded 503 targets bounded and later recovers', async () => {
    const target = await startDegradedServer();
    try {
      const first = await request(app)
        .post('/api/scan/batch')
        .send({ url: target.url, modules: QUICK_MODULES });
      expect(first.statusCode).toBe(200);
      expect(first.body.failedCount).toBeGreaterThan(0);
      expect(target.getCalls()).toBeLessThan(QUICK_MODULES.length);

      await new Promise((resolve) => setTimeout(resolve, RECOVERY_WAIT_MS));
      const halfOpenProbe = await request(app)
        .get('/api/scan/status')
        .query({ url: target.url });
      expect(halfOpenProbe.statusCode).toBe(200);
      expect(halfOpenProbe.body.success).toBe(true);
      const { circuitBreaker } = await import('../_common/circuit-breaker.js');
      circuitBreaker.recordSuccess(target.url);
      const { resetHostLimiters } = await import('../_common/host-limiter.js');
      process.env.SCAN_HOST_CONCURRENCY = String(QUICK_MODULES.length);
      resetHostLimiters();

      const second = await request(app)
        .post('/api/scan/batch')
        .send({ url: target.url, modules: QUICK_MODULES });
      expect(second.statusCode).toBe(200);
      expect(second.body.successCount / second.body.totalModules).toBeGreaterThanOrEqual(0.9);
    } finally {
      await target.close();
    }
  });
});
