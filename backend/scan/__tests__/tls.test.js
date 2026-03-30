/**
 * Tests for TLS module (Mozilla TLS Observatory integration).
 */

import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

describe('tls module', () => {
  it('returns TLS data on success when mocked', async () => {
    const mockTlsResult = {
      grade: 'A',
      protocols: [
        { name: 'TLS 1.3', supported: true, secure: true },
        { name: 'TLS 1.2', supported: true, secure: true },
      ],
      cipher_suites: [
        { name: 'TLS_AES_256_GCM_SHA384', strength: 'strong' },
      ],
    };

    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: true,
        data: mockTlsResult,
        duration_ms: 1500,
      });
    };

    setModulesForTest(new Map([['tls', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/tls')
      .query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(200);
    const body = response.body;
    expect(body.success).toBe(true);
    expect(body.data.grade).toBe('A');
    expect(body.data.protocols).toHaveLength(2);
    expect(body.data.cipher_suites).toHaveLength(1);
    expect(body.data.protocols[0].name).toBe('TLS 1.3');
  });

  it('handles TLS module error (Mozilla API failure)', async () => {
    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: false,
        data: { error: 'Failed to get scan_id from TLS Observatory', success: false },
        duration_ms: 500,
      });
    };

    setModulesForTest(new Map([['tls', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/tls')
      .query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.data.error).toContain('TLS Observatory');
  });

  it('tls module is loaded by registry and uses Mozilla API', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();
    expect(modules.has('tls')).toBe(true);

    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const tlsPath = path.join(dir, '..', 'tls.js');
    const source = fs.readFileSync(tlsPath, 'utf8');
    expect(source).toContain('tls-observatory.services.mozilla.com');
    expect(source).toContain('axios');
  });
});
