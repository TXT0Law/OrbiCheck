/**
 * Tests for get-ip module integration.
 * Uses mocked module responses to verify the scan API correctly
 * passes through get-ip results (with enrichment when available).
 */

import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

describe('get-ip module', () => {
  it('returns IP with enrichment when module succeeds', async () => {
    const getIpWithEnrichment = (_req, res) => {
      res.status(200).json({
        ip: '93.184.216.34',
        address: '93.184.216.34',
        asn: '15169',
        isp: 'Fastly',
        org: 'Fastly Inc',
        country: 'United States',
        countryCode: 'US',
        city: 'San Francisco',
        region: 'California',
        hostingProvider: 'yes',
        isHosting: true,
      });
    };

    setModulesForTest(new Map([['get-ip', getIpWithEnrichment]]));

    const response = await request(app)
      .get('/api/scan/get-ip')
      .query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(200);
    const data = response.body.data || response.body;
    expect(response.body.success).toBe(true);
    expect(data.ip || data.address).toBe('93.184.216.34');
    expect(data.country).toBe('United States');
    expect(data.isp).toBe('Fastly');
  });

  it('graceful degradation when enrichment fails - IP still returned', async () => {
    const getIpNoEnrichment = (_req, res) => {
      res.status(200).json({
        ip: '93.184.216.34',
        address: '93.184.216.34',
        asn: '',
        isp: '',
        country: '',
        city: '',
      });
    };

    setModulesForTest(new Map([['get-ip', getIpNoEnrichment]]));

    const response = await request(app)
      .get('/api/scan/get-ip')
      .query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(200);
    const data = response.body.data || response.body;
    expect(response.body.success).toBe(true);
    expect(data.ip || data.address).toBe('93.184.216.34');
  });

  it('returns error envelope when DNS resolution fails', async () => {
    const getIpDnsFail = (_req, res) => {
      res.status(500).json({ error: 'getaddrinfo ENOTFOUND' });
    };

    setModulesForTest(new Map([['get-ip', getIpDnsFail]]));

    const response = await request(app)
      .get('/api/scan/get-ip')
      .query({ url: 'https://nonexistent-domain-xyz.com' });

    expect(response.statusCode).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('getaddrinfo');
  });
});
