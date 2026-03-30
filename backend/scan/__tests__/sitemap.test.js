import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

const TARGET_URL = 'https://example.com';

describe('sitemap module', () => {
  afterEach(() => {
    setModulesForTest(new Map());
  });

  it('returns sitemap data on success', async () => {
    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: true,
        data: {
          urlset: {
            url: [
              { loc: ['https://example.com/'] },
              { loc: ['https://example.com/about'] },
            ],
          },
        },
        error: null,
        duration_ms: 18,
      });
    };

    setModulesForTest(new Map([['sitemap', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/sitemap')
      .query({ url: TARGET_URL });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data.urlset.url)).toBe(true);
    expect(response.body.data.urlset.url[0].loc[0]).toBe('https://example.com/');
    expect(response.body.duration_ms).toEqual(expect.any(Number));
  });

  it('returns empty sitemap data gracefully', async () => {
    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: true,
        data: { urlset: { url: [] } },
        error: null,
        duration_ms: 5,
      });
    };

    setModulesForTest(new Map([['sitemap', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/sitemap')
      .query({ url: TARGET_URL });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.urlset.url).toEqual([]);
    expect(response.body.error).toBeNull();
  });

  it('masks unexpected module errors', async () => {
    setModulesForTest(
      new Map([
        [
          'sitemap',
          () => {
            throw new Error('sitemap exploded');
          },
        ],
      ])
    );

    const response = await request(app)
      .get('/api/scan/sitemap')
      .query({ url: TARGET_URL });

    expect(response.statusCode).toBe(500);
    expect(response.body.error).toBe('Scan service request failed');
    expect(response.body.stack).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('sitemap exploded');
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(new Map([['sitemap', (_req, res) => res.status(200).json({})]]));

    const response = await request(app).get('/api/scan/sitemap');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('sitemap')).toBe(true);
  });
});
