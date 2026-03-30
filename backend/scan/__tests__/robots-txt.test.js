import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

const TARGET_URL = 'https://example.com';

describe('robots-txt module', () => {
  afterEach(() => {
    setModulesForTest(new Map());
  });

  it('returns parsed robots rules on success', async () => {
    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: true,
        data: {
          robots: [
            { lbl: 'User-agent', val: '*' },
            { lbl: 'Disallow', val: '/admin' },
          ],
        },
        error: null,
        duration_ms: 14,
      });
    };

    setModulesForTest(new Map([['robots-txt', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/robots-txt')
      .query({ url: TARGET_URL });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data.robots)).toBe(true);
    expect(response.body.data.robots[0]).toEqual({
      lbl: expect.any(String),
      val: expect.any(String),
    });
    expect(response.body.duration_ms).toEqual(expect.any(Number));
  });

  it('returns empty robots data gracefully', async () => {
    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: true,
        data: { robots: [] },
        error: null,
        duration_ms: 3,
      });
    };

    setModulesForTest(new Map([['robots-txt', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/robots-txt')
      .query({ url: TARGET_URL });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.robots).toEqual([]);
    expect(response.body.error).toBeNull();
  });

  it('masks unexpected module errors', async () => {
    setModulesForTest(
      new Map([
        [
          'robots-txt',
          () => {
            throw new Error('robots exploded');
          },
        ],
      ])
    );

    const response = await request(app)
      .get('/api/scan/robots-txt')
      .query({ url: TARGET_URL });

    expect(response.statusCode).toBe(500);
    expect(response.body.error).toBe('Scan service request failed');
    expect(response.body.stack).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('robots exploded');
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(new Map([['robots-txt', (_req, res) => res.status(200).json({})]]));

    const response = await request(app).get('/api/scan/robots-txt');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('robots-txt')).toBe(true);
  });
});
