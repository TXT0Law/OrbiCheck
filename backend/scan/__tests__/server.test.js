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
});
