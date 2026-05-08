import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

describe('scan service routes', () => {
  beforeEach(() => {
    setModulesForTest(
      new Map([
        [
          'ok',
          (_req, res) => {
            res.status(200).json({ success: true, data: { ok: true } });
          },
        ],
        [
          'broken',
          () => {
            throw new Error('forced failure');
          },
        ],
      ])
    );
  });

  it('returns service health', async () => {
    const response = await request(app).get('/health');

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.modules).toBe(2);
  });

  it('returns 404 for unknown module', async () => {
    const response = await request(app).get('/api/scan/missing').query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(404);
    expect(response.body.error).toContain('Unknown module');
  });

  it('runs batch scan and reports mixed result states', async () => {
    const response = await request(app)
      .post('/api/scan/batch')
      .send({ url: 'https://example.com', modules: ['ok', 'broken'] });

    expect(response.statusCode).toBe(200);
    expect(response.body.totalModules).toBe(2);
    expect(response.body.successCount).toBe(1);
    expect(response.body.failedCount).toBe(1);
    expect(response.body.results.ok.success).toBe(true);
    expect(response.body.results.broken.success).toBe(false);
  });

  it('returns 400 when batch payload is missing url', async () => {
    const response = await request(app)
      .post('/api/scan/batch')
      .send({ modules: ['ok'] });

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required field: url');
  });

  it('masks unexpected module errors and sets security headers', async () => {
    const response = await request(app)
      .get('/api/scan/broken')
      .query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(500);
    expect(response.body.error).toBe('Scan service request failed');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('echoes back caller-provided X-Scan-Id / X-Trace-Id (P1-3 trace propagation)', async () => {
    const response = await request(app)
      .get('/api/scan/ok')
      .set('X-Scan-Id', 'scan-abc-123')
      .set('X-Trace-Id', 'trace-xyz-789')
      .query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-scan-id']).toBe('scan-abc-123');
    expect(response.headers['x-trace-id']).toBe('trace-xyz-789');
  });

  it('mints a synthetic X-Scan-Id when caller does not provide one', async () => {
    const response = await request(app)
      .get('/api/scan/ok')
      .query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(200);
    // Auto-generated UUID v4 (length 36 with 4 dashes).
    expect(response.headers['x-scan-id']).toMatch(/^[0-9a-f-]{36}$/i);
    // Trace id falls back to scan id when not explicitly provided.
    expect(response.headers['x-trace-id']).toBe(response.headers['x-scan-id']);
  });

  // P3-2: Prometheus exposition endpoint
  it('exposes Prometheus metrics under /metrics with default + module counters', async () => {
    // Drive at least one module run so the counter is non-empty.
    await request(app).get('/api/scan/ok').query({ url: 'https://example.com' });

    const response = await request(app).get('/metrics');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('scan_module_runs_total');
    expect(response.text).toMatch(/scan_module_runs_total\{[^}]*module="ok"[^}]*\}/);
    // Default Node.js process metrics carry the scan_ prefix from collectDefaultMetrics.
    expect(response.text).toContain('scan_process_resident_memory_bytes');
  });

  // P3-3: config snapshot endpoint
  it('returns a config snapshot under /api/scan/config', async () => {
    const response = await request(app).get('/api/scan/config');

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('moduleTimeoutMs');
    expect(response.body).toHaveProperty('extendedTimeoutMs');
    expect(response.body).toHaveProperty('batchConcurrency');
    expect(response.body).toHaveProperty('httpRetry');
    expect(response.body.batchConcurrency).toBeGreaterThan(0);
  });

  // P3-4: batch concurrency throttling — verify cap is enforced when many
  // modules are requested at once. We register 5 slow modules and set the
  // limit to 2; the maximum simultaneously-active count must not exceed 2.
  it('caps batch concurrency at SCAN_BATCH_CONCURRENCY (P3-4)', async () => {
    process.env.SCAN_BATCH_CONCURRENCY = '2';
    let inFlight = 0;
    let peak = 0;
    const slow = async (_req, res) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 30));
      inFlight -= 1;
      res.status(200).json({ success: true, data: {} });
    };
    setModulesForTest(new Map([
      ['m1', slow], ['m2', slow], ['m3', slow], ['m4', slow], ['m5', slow],
    ]));

    const response = await request(app)
      .post('/api/scan/batch')
      .send({ url: 'https://example.com', modules: ['m1', 'm2', 'm3', 'm4', 'm5'] });

    expect(response.statusCode).toBe(200);
    expect(response.body.totalModules).toBe(5);
    expect(response.body.successCount).toBe(5);
    expect(peak).toBeLessThanOrEqual(2);

    delete process.env.SCAN_BATCH_CONCURRENCY;
  });
});
