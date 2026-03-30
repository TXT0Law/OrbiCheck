import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

const TARGET_URL = 'https://example.com';

describe('linked-pages module', () => {
  afterEach(() => {
    setModulesForTest(new Map());
  });

  it('returns internal and external links on success', async () => {
    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: true,
        data: {
          internal: ['https://example.com/', 'https://example.com/about'],
          external: ['https://github.com/example'],
        },
        error: null,
        duration_ms: 10,
      });
    };

    setModulesForTest(new Map([['linked-pages', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/linked-pages')
      .query({ url: TARGET_URL });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data.internal)).toBe(true);
    expect(Array.isArray(response.body.data.external)).toBe(true);
    expect(response.body.data.internal[0]).toContain('example.com');
    expect(response.body.duration_ms).toEqual(expect.any(Number));
  });

  it('returns empty link collections gracefully', async () => {
    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: true,
        data: {
          internal: [],
          external: [],
        },
        error: null,
        duration_ms: 2,
      });
    };

    setModulesForTest(new Map([['linked-pages', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/linked-pages')
      .query({ url: TARGET_URL });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.internal).toEqual([]);
    expect(response.body.data.external).toEqual([]);
  });

  it('masks unexpected module errors', async () => {
    setModulesForTest(
      new Map([
        [
          'linked-pages',
          () => {
            throw new Error('links exploded');
          },
        ],
      ])
    );

    const response = await request(app)
      .get('/api/scan/linked-pages')
      .query({ url: TARGET_URL });

    expect(response.statusCode).toBe(500);
    expect(response.body.error).toBe('Scan service request failed');
    expect(response.body.stack).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('links exploded');
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(new Map([['linked-pages', (_req, res) => res.status(200).json({})]]));

    const response = await request(app).get('/api/scan/linked-pages');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('linked-pages')).toBe(true);
  });
});
