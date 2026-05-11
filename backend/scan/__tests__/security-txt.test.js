/**
 * Tests for the rewritten security-txt module (S-4).
 *
 * After S-4 the module fetches via `_common/http.js` (axios) instead of
 * `follow-redirects`. We spin up a tiny in-process HTTP server so the
 * timeout / redirect / 404 paths exercise the real interceptor stack,
 * including the per-host circuit breaker (S-1).
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import http from 'http';
import request from 'supertest';

import { circuitBreaker } from '../_common/circuit-breaker.js';
import { handler } from '../security-txt.js';
import { app, setModulesForTest } from '../server.js';

let server;
let port;
let responses;

beforeEach(async () => {
  circuitBreaker.reset();
  responses = new Map();
  server = http.createServer((req, res) => {
    const choice = responses.get(req.url) || { status: 404, body: '' };
    res.statusCode = choice.status;
    res.setHeader('Content-Type', 'text/plain');
    res.end(choice.body || '');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  setModulesForTest(new Map());
});

function originUrl() {
  return `http://127.0.0.1:${port}`;
}

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

async function invoke(url) {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('security-txt module (S-4)', () => {
  it('parses RFC-9116 fields from /.well-known/security.txt', async () => {
    responses.set('/.well-known/security.txt', {
      status: 200,
      body: [
        'Contact: mailto:security@example.com',
        'Contact: https://example.com/security',
        'Expires: 2027-01-01T00:00:00.000Z',
        '-----BEGIN PGP SIGNED MESSAGE-----',
      ].join('\n'),
    });
    const response = await invoke(originUrl());
    expect(response.body.success).toBe(true);
    expect(response.body.data.isPresent).toBe(true);
    expect(response.body.data.isPgpSigned).toBe(true);
    expect(response.body.data.fields.Contact).toBe('mailto:security@example.com');
    expect(response.body.data.fields.Contact1).toBe('https://example.com/security');
  });

  it('reports not present when both candidate paths return 404', async () => {
    const response = await invoke(originUrl());
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({ isPresent: false });
  });

  it('treats an HTML error page as not present', async () => {
    responses.set('/security.txt', {
      status: 200,
      body: '<html><body>not found</body></html>',
    });
    const response = await invoke(originUrl());
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({ isPresent: false });
  });

  it('returns 400 envelope when url query parameter is missing', async () => {
    setModulesForTest(
      new Map([
        ['security-txt', (_req, res) => res.status(200).json({ ok: true })],
      ]),
    );
    const response = await request(app).get('/api/scan/security-txt');
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();
    expect(modules.has('security-txt')).toBe(true);
  });
});
