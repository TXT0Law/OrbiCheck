/**
 * Tests for associated-hosts module.
 */

import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

describe('associated-hosts module', () => {
  it('returns certificate SAN hosts when mocked', async () => {
    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: true,
        data: {
          domain: 'example.com',
          hosts: [
            { hostname: 'www.example.com', source: 'certificate' },
            { hostname: 'mail.example.com', source: 'certificate' },
          ],
          totalFound: 2,
        },
        duration_ms: 100,
      });
    };

    setModulesForTest(new Map([['associated-hosts', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/associated-hosts')
      .query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(200);
    const body = response.body;
    expect(body.success).toBe(true);
    expect(body.data.hosts).toHaveLength(2);
    expect(body.data.hosts[0].source).toBe('certificate');
    expect(body.data.domain).toBe('example.com');
  });

  it('excludes original domain from results when module returns filtered data', async () => {
    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: true,
        data: {
          domain: 'example.com',
          hosts: [
            { hostname: 'www.example.com', source: 'certificate' },
            { hostname: 'cdn.example.com', source: 'same-ip', ip: '1.2.3.4' },
          ],
          totalFound: 2,
        },
        duration_ms: 50,
      });
    };

    setModulesForTest(new Map([['associated-hosts', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/associated-hosts')
      .query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(200);
    const hosts = response.body.data.hosts;
    expect(hosts.every((h) => h.hostname !== 'example.com')).toBe(true);
  });

  it('handles module failure gracefully', async () => {
    const mockHandler = (_req, res) => {
      res.status(500).json({
        success: false,
        data: { domain: '', hosts: [], totalFound: 0 },
        error: 'TLS connection failed',
      });
    };

    setModulesForTest(new Map([['associated-hosts', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/associated-hosts')
      .query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(500);
  });

  it('module is loaded by registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();
    expect(modules.has('associated-hosts')).toBe(true);
  });
});
