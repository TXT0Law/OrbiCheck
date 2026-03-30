import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

const TARGET_URL = 'https://example.com';

describe('dns-server module', () => {
  afterEach(() => {
    setModulesForTest(new Map());
  });

  it('returns DNS server details on success', async () => {
    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: true,
        data: {
          domain: 'example.com',
          dns: [
            {
              address: '1.1.1.1',
              hostname: ['one.one.one.one'],
              dohDirectSupports: true,
            },
          ],
        },
        error: null,
        duration_ms: 22,
      });
    };

    setModulesForTest(new Map([['dns-server', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/dns-server')
      .query({ url: TARGET_URL });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.domain).toBe('example.com');
    expect(Array.isArray(response.body.data.dns)).toBe(true);
    expect(response.body.data.dns[0]).toEqual({
      address: expect.any(String),
      hostname: expect.any(Array),
      dohDirectSupports: expect.any(Boolean),
    });
  });

  it('returns empty DNS server data gracefully', async () => {
    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: true,
        data: {
          domain: 'example.com',
          dns: [],
        },
        error: null,
        duration_ms: 4,
      });
    };

    setModulesForTest(new Map([['dns-server', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/dns-server')
      .query({ url: TARGET_URL });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.dns).toEqual([]);
    expect(response.body.error).toBeNull();
  });

  it('masks unexpected module errors', async () => {
    setModulesForTest(
      new Map([
        [
          'dns-server',
          () => {
            throw new Error('dns exploded');
          },
        ],
      ])
    );

    const response = await request(app)
      .get('/api/scan/dns-server')
      .query({ url: TARGET_URL });

    expect(response.statusCode).toBe(500);
    expect(response.body.error).toBe('Scan service request failed');
    expect(response.body.stack).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('dns exploded');
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(new Map([['dns-server', (_req, res) => res.status(200).json({})]]));

    const response = await request(app).get('/api/scan/dns-server');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('dns-server')).toBe(true);
  });
});
