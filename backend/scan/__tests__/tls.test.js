/**
 * Tests for TLS module — local `tls.connect()` probe (post-Mozilla replacement).
 */

import { jest } from '@jest/globals';
import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

function createResponseCapture() {
  return {
    headersSent: false,
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.headersSent = true;
      this.body = body;
      return this;
    },
  };
}

/**
 * Build a `tls.connect` mock that resolves the per-version handshake outcome
 * declared in `versionOutcomes`. Each entry maps a `minVersion` (e.g. "TLSv1.3")
 * to either { supported: true, cipher: "..." } or { supported: false, error: "..." }.
 */
function buildTlsModuleMock(versionOutcomes, peerCert = null) {
  const connectSpy = jest.fn((options, onConnect) => {
    const outcome = versionOutcomes[options.minVersion]
      ?? versionOutcomes._default
      ?? { supported: false, error: 'unsupported in mock' };
    const handlers = {};
    const socket = {
      setTimeout: jest.fn(),
      on(event, handler) {
        handlers[event] = handler;
        return socket;
      },
      end: jest.fn(),
      destroy: jest.fn(),
      getCipher: jest.fn(() => (outcome.supported ? { name: outcome.cipher } : null)),
      alpnProtocol: outcome.supported ? 'h2' : null,
      getPeerCertificate: jest.fn(() => (outcome.supported ? peerCert : null)),
    };
    process.nextTick(() => {
      if (outcome.supported) {
        onConnect();
      } else if (handlers.error) {
        handlers.error(new Error(outcome.error || 'handshake failed'));
      }
    });
    return socket;
  });
  return { connect: connectSpy };
}

async function loadHandlerWithTls(versionOutcomes, peerCert = null) {
  jest.resetModules();
  const tlsMock = buildTlsModuleMock(versionOutcomes, peerCert);
  await jest.unstable_mockModule('tls', () => ({ default: tlsMock }));
  const { handler } = await import('../tls.js');
  return { handler, connectSpy: tlsMock.connect };
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('tls module (local probe)', () => {
  it('returns Mozilla-compatible payload when modern TLS versions handshake', async () => {
    const peerCert = {
      subject: { CN: 'example.com' },
      issuer: { CN: 'Example CA' },
      valid_from: 'Jan 01 00:00:00 2026 GMT',
      valid_to: 'Jan 01 00:00:00 2027 GMT',
      issuerCertificate: null,
    };
    const { handler } = await loadHandlerWithTls(
      {
        'TLSv1.3': { supported: true, cipher: 'TLS_AES_256_GCM_SHA384' },
        'TLSv1.2': { supported: true, cipher: 'ECDHE-RSA-AES256-GCM-SHA384' },
        'TLSv1.1': { supported: false, error: 'protocol disabled' },
        TLSv1: { supported: false, error: 'protocol disabled' },
      },
      peerCert,
    );

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.grade).toMatch(/^A\+?$/);
    expect(response.body.data.connection.protocols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'TLSv1.3', supported: true }),
        expect.objectContaining({ name: 'TLSv1.2', supported: true }),
        expect.objectContaining({ name: 'TLSv1.1', supported: false }),
      ]),
    );
    const cipherNames = response.body.data.connection.ciphers.map((c) => c.name);
    expect(cipherNames).toContain('TLS_AES_256_GCM_SHA384');
    expect(cipherNames).toContain('ECDHE-RSA-AES256-GCM-SHA384');
    expect(response.body.data.forward_secrecy).toBe(true);
    expect(response.body.data.certificates).toEqual([
      expect.objectContaining({ subject: { CN: 'example.com' } }),
    ]);
  });

  it('downgrades grade to B when only legacy TLS versions handshake', async () => {
    const { handler } = await loadHandlerWithTls({
      'TLSv1.3': { supported: false, error: 'no' },
      'TLSv1.2': { supported: true, cipher: 'ECDHE-RSA-AES128-GCM-SHA256' },
      'TLSv1.1': { supported: true, cipher: 'AES128-SHA' },
      TLSv1: { supported: true, cipher: 'AES128-SHA' },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.grade).toBe('B');
  });

  it('returns success: false when every TLS handshake fails', async () => {
    const { handler } = await loadHandlerWithTls({
      'TLSv1.3': { supported: false, error: 'unreachable' },
      'TLSv1.2': { supported: false, error: 'unreachable' },
      'TLSv1.1': { supported: false, error: 'unreachable' },
      TLSv1: { supported: false, error: 'unreachable' },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body.success).toBe(false);
    expect(typeof response.body.error).toBe('string');
  });

  it('does not depend on the retired Mozilla TLS Observatory endpoint', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const tlsPath = path.join(dir, '..', 'tls.js');
    const source = fs.readFileSync(tlsPath, 'utf8');
    expect(source).not.toContain('tls-observatory.services.mozilla.com');
    expect(source).toContain('tls.connect');
  });

  it('keeps the legacy /api/scan/tls route stub working when modules are stubbed', async () => {
    const mockHandler = (_req, res) => {
      res.status(200).json({ success: true, data: { grade: 'A' }, durationMs: 1 });
    };
    setModulesForTest(new Map([['tls', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/tls')
      .query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(200);
    expect(response.body.data.grade).toBe('A');

    setModulesForTest(new Map());
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();
    expect(modules.has('tls')).toBe(true);
  });
});
