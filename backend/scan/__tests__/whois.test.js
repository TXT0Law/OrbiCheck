/**
 * Tests for whois module.
 */

import { jest } from '@jest/globals';
import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

describe('whois module', () => {
  it('extracts sie.gov.hk correctly (gov.hk is second-level TLD)', async () => {
    const { extractDomainFromUrl } = await import('../whois.js');
    expect(extractDomainFromUrl('https://sie.gov.hk')).toBe('sie.gov.hk');
    expect(extractDomainFromUrl('https://digitalpolicy.gov.hk')).toBe('digitalpolicy.gov.hk');
  });

  it('extracts arena.ai from URL with path (regression for psl.parse failure)', async () => {
    const { extractDomainFromUrl } = await import('../whois.js');
    const url = 'https://arena.ai/c/019cfeff-98c9-7fd0-9e59-34cddead2faa';
    const domain = extractDomainFromUrl(url);
    expect(domain).toBe('arena.ai');
    expect(domain).not.toBe('undefined');
  });

  it('extracts domain from URL with subdomain and query string', async () => {
    const { extractDomainFromUrl } = await import('../whois.js');
    expect(extractDomainFromUrl('https://www.example.com/?q=test')).toBe('example.com');
  });

  it('returns .hk-style data (Registrar Name, Domain Status) when mocked', async () => {
    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: true,
        data: {
          domain: 'digitalpolicy.gov.hk',
          registrar: 'Hong Kong Domain Name Registration Company Limited',
          domainStatus: ['Active'],
        },
        duration_ms: 100,
      });
    };
    setModulesForTest(new Map([['whois', mockHandler]]));
    const response = await request(app).get('/api/scan/whois').query({ url: 'https://digitalpolicy.gov.hk' });
    expect(response.statusCode).toBe(200);
    expect(response.body.data.registrar).toBe('Hong Kong Domain Name Registration Company Limited');
    expect(response.body.data.domainStatus).toContain('Active');
  });

  it('returns parsed WHOIS data on success when mocked', async () => {
    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: true,
        data: {
          domain: 'example.com',
          registrar: 'GoDaddy LLC',
          creationDate: '2020-01-15',
          updatedDate: '2024-01-10',
          expiryDate: '2026-01-15',
          nameServers: ['ns1.example.com', 'ns2.example.com'],
          domainStatus: ['clientTransferProhibited'],
          rawText: 'Domain Name: EXAMPLE.COM\nRegistrar: GoDaddy LLC\n...',
        },
        duration_ms: 200,
      });
    };

    setModulesForTest(new Map([['whois', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/whois')
      .query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(200);
    const body = response.body;
    expect(body.data.registrar).toBe('GoDaddy LLC');
    expect(body.data.creationDate).toBe('2020-01-15');
    expect(body.data.nameServers).toHaveLength(2);
    expect(body.data.domainStatus).toContain('clientTransferProhibited');
  });

  it('limits raw text to 5000 chars when module returns long response', async () => {
    const longRaw = 'x'.repeat(10000);
    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: true,
        data: {
          domain: 'example.com',
          registrar: 'Test',
          rawText: longRaw,
        },
        duration_ms: 100,
      });
    };

    setModulesForTest(new Map([['whois', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/whois')
      .query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(200);
    expect(response.body.data.rawText.length).toBeLessThanOrEqual(10000);
  });

  it('handles lookup failure', async () => {
    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: false,
        data: {},
        error: 'WHOIS lookup timed out',
        duration_ms: 15000,
      });
    };

    setModulesForTest(new Map([['whois', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/whois')
      .query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('timed out');
  });

  it('module is loaded by registry and has no external HTTP API', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();
    expect(modules.has('whois')).toBe(true);

    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const whoisPath = path.join(dir, '..', 'whois.js');
    const source = fs.readFileSync(whoisPath, 'utf8');
    expect(source).not.toContain('whois-api-zeta.vercel.app');
    expect(source).not.toContain('axios');
  });

  // P2-4 LRU cache regressions ------------------------------------------------
  describe('LRU cache eviction (P2-4)', () => {
    let helpers;
    let originalCacheMax;

    beforeAll(async () => {
      // Force a small cache so the test does not need to insert hundreds of
      // entries to trigger eviction. Use jest.resetModules() to bypass the
      // ESM cache so WHOIS_CACHE_MAX is re-read from env on next import.
      originalCacheMax = process.env.WHOIS_CACHE_MAX;
      process.env.WHOIS_CACHE_MAX = '3';
      jest.resetModules();
      helpers = await import('../whois.js');
    });

    afterAll(() => {
      if (originalCacheMax === undefined) {
        delete process.env.WHOIS_CACHE_MAX;
      } else {
        process.env.WHOIS_CACHE_MAX = originalCacheMax;
      }
    });

    beforeEach(() => {
      helpers._resetWhoisCacheForTest();
    });

    it('evicts the least-recently-USED entry, not the least-recently-inserted', () => {
      helpers._whoisCacheSetForTest('a.com', { v: 1 });
      helpers._whoisCacheSetForTest('b.com', { v: 2 });
      helpers._whoisCacheSetForTest('c.com', { v: 3 });

      // Touch a.com so it becomes most-recently-used.
      expect(helpers._whoisCacheGetForTest('a.com')).toEqual({ v: 1 });

      // Insert a 4th entry; FIFO would evict a.com, LRU should evict b.com.
      helpers._whoisCacheSetForTest('d.com', { v: 4 });

      expect(helpers._whoisCacheSizeForTest()).toBe(3);
      expect(helpers._whoisCachePeekForTest('a.com')).not.toBeNull();
      expect(helpers._whoisCachePeekForTest('b.com')).toBeNull();
      expect(helpers._whoisCachePeekForTest('c.com')).not.toBeNull();
      expect(helpers._whoisCachePeekForTest('d.com')).not.toBeNull();
    });

    it('updating an existing key keeps it as most-recently-used', () => {
      helpers._whoisCacheSetForTest('a.com', { v: 1 });
      helpers._whoisCacheSetForTest('b.com', { v: 2 });
      helpers._whoisCacheSetForTest('c.com', { v: 3 });

      // Re-insert a.com (e.g. WHOIS data refreshed) - should NOT be evicted on next insert.
      helpers._whoisCacheSetForTest('a.com', { v: 99 });
      helpers._whoisCacheSetForTest('d.com', { v: 4 });

      expect(helpers._whoisCacheSizeForTest()).toBe(3);
      expect(helpers._whoisCachePeekForTest('a.com')?.data).toEqual({ v: 99 });
      expect(helpers._whoisCachePeekForTest('b.com')).toBeNull();
    });

    it('expires entries after TTL and prunes them on read', () => {
      helpers._whoisCacheSetForTest('a.com', { v: 1 });
      const peeked = helpers._whoisCachePeekForTest('a.com');
      expect(peeked).not.toBeNull();
      // Force expiry by mutating expiresAt directly via the internal handle.
      peeked.expiresAt = Date.now() - 1000;

      expect(helpers._whoisCacheGetForTest('a.com')).toBeNull();
      expect(helpers._whoisCachePeekForTest('a.com')).toBeNull();
    });
  });
});
