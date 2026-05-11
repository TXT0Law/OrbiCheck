/**
 * Tests for the rewritten status module (S-3).
 *
 * The module now uses the shared axios instance, so we point it at a tiny
 * in-process HTTP server rather than mocking the bare `https` module. This
 * also exercises http:// (not just https://), which was the original bug.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import http from 'http';
import request from 'supertest';

import { circuitBreaker } from '../_common/circuit-breaker.js';
import { handler } from '../status.js';
import { app, setModulesForTest } from '../server.js';

let server;
let port;
let responder;

beforeEach(async () => {
  circuitBreaker.reset();
  responder = (_req, res) => {
    res.statusCode = 200;
    res.setHeader('Server', 'test-server');
    res.end('ok');
  };
  server = http.createServer((req, res) => responder(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  setModulesForTest(new Map());
});

function urlFor(path = '/') {
  return `http://127.0.0.1:${port}${path}`;
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

describe('status module (S-3)', () => {
  it('reports isUp:true for an http:// target that responds 200', async () => {
    const response = await invoke(urlFor('/'));
    expect(response.body.success).toBe(true);
    expect(response.body.data.isUp).toBe(true);
    expect(response.body.data.responseCode).toBe(200);
    expect(typeof response.body.data.responseTime).toBe('number');
    expect(response.body.data.server).toBe('test-server');
  });

  it('follows 3xx redirects up to the configured limit', async () => {
    let hits = 0;
    responder = (_req, res) => {
      hits += 1;
      if (hits === 1) {
        res.statusCode = 302;
        res.setHeader('Location', '/final');
        res.end('redirect');
        return;
      }
      res.statusCode = 200;
      res.end('done');
    };
    const response = await invoke(urlFor('/start'));
    expect(response.body.success).toBe(true);
    expect(response.body.data.responseCode).toBe(200);
    expect(hits).toBe(2);
  });

  it('falls back to GET when the server replies 405 to HEAD', async () => {
    let sawHead = false;
    let sawGet = false;
    responder = (req, res) => {
      if (req.method === 'HEAD') {
        sawHead = true;
        res.statusCode = 405;
        res.end();
        return;
      }
      if (req.method === 'GET') {
        sawGet = true;
        res.statusCode = 200;
        res.end('ok');
        return;
      }
      res.statusCode = 400;
      res.end();
    };
    const response = await invoke(urlFor('/'));
    expect(sawHead).toBe(true);
    expect(sawGet).toBe(true);
    expect(response.body.success).toBe(true);
    expect(response.body.data.responseCode).toBe(200);
  });

  it('returns success:false with the upstream status when probe yields 5xx', async () => {
    responder = (_req, res) => {
      res.statusCode = 503;
      res.end('down');
    };
    const response = await invoke(urlFor('/'));
    expect(response.body.success).toBe(false);
    expect(response.body.data.isUp).toBe(false);
    expect(response.body.data.responseCode).toBe(503);
  });

  it('returns 400 envelope when the request lacks a URL query parameter', async () => {
    setModulesForTest(
      new Map([
        [
          'status',
          (_req, res) => res.status(200).json({ ok: true }),
        ],
      ]),
    );
    const response = await request(app).get('/api/scan/status');
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in the module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();
    expect(modules.has('status')).toBe(true);
  });
});
