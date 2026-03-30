import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

const TARGET_URL = 'https://example.com';

describe('txt-records module', () => {
  afterEach(() => {
    setModulesForTest(new Map());
  });

  it('returns TXT record data on success', async () => {
    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: true,
        data: {
          v: 'spf1 include:_spf.example.com ~all',
          'google-site-verification': 'token-value',
        },
        error: null,
        duration_ms: 11,
      });
    };

    setModulesForTest(new Map([['txt-records', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/txt-records')
      .query({ url: TARGET_URL });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.v).toEqual(expect.any(String));
    expect(response.body.data['google-site-verification']).toEqual(expect.any(String));
    expect(response.body.duration_ms).toEqual(expect.any(Number));
  });

  it('returns empty TXT record data gracefully', async () => {
    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: true,
        data: {},
        error: null,
        duration_ms: 1,
      });
    };

    setModulesForTest(new Map([['txt-records', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/txt-records')
      .query({ url: TARGET_URL });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({});
    expect(response.body.error).toBeNull();
  });

  it('masks unexpected module errors', async () => {
    setModulesForTest(
      new Map([
        [
          'txt-records',
          () => {
            throw new Error('txt exploded');
          },
        ],
      ])
    );

    const response = await request(app)
      .get('/api/scan/txt-records')
      .query({ url: TARGET_URL });

    expect(response.statusCode).toBe(500);
    expect(response.body.error).toBe('Scan service request failed');
    expect(response.body.stack).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('txt exploded');
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(new Map([['txt-records', (_req, res) => res.status(200).json({})]]));

    const response = await request(app).get('/api/scan/txt-records');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('txt-records')).toBe(true);
  });
});
