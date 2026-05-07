import { EventEmitter } from 'events';
import { jest } from '@jest/globals';
import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

const GENERIC_ERROR_MESSAGE = 'Request failed while processing this scan module.';

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

function createHttpsResponse(chunks) {
  const response = new EventEmitter();
  process.nextTick(() => {
    chunks.forEach((chunk) => response.emit('data', chunk));
    response.emit('end');
  });
  return response;
}

async function loadHandlerWithHttps(getImplementation) {
  jest.resetModules();
  await jest.unstable_mockModule('https', () => ({
    default: { get: getImplementation },
  }));
  const { handler } = await import('../carbon.js');
  return handler;
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('carbon module', () => {
  afterEach(() => {
    setModulesForTest(new Map());
  });

  it('returns website carbon data on success', async () => {
    const httpsGet = jest.fn((url, callback) => {
      const response = url.includes('websitecarbon')
        ? createHttpsResponse([JSON.stringify({ statistics: { adjustedBytes: 1024, energy: 0.1 } })])
        : createHttpsResponse(['<html>Hello world</html>']);
      callback(response);
      return new EventEmitter();
    });

    const handler = await loadHandlerWithHttps(httpsGet);
    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.statistics.adjustedBytes).toBe(1024);
    expect(response.body.data.scanUrl).toBe('https://example.com');
  });

  it('returns a skipped payload when carbon statistics are empty', async () => {
    const httpsGet = jest.fn((url, callback) => {
      const response = url.includes('websitecarbon')
        ? createHttpsResponse([JSON.stringify({ statistics: { adjustedBytes: 0, energy: 0 } })])
        : createHttpsResponse(['<html>Hello world</html>']);
      callback(response);
      return new EventEmitter();
    });

    const handler = await loadHandlerWithHttps(httpsGet);
    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.skipped).toBe('Not enough info to get carbon data');
  });

  it('returns a generic error when the upstream response is invalid', async () => {
    const httpsGet = jest.fn((url, callback) => {
      const response = url.includes('websitecarbon')
        ? createHttpsResponse(['<!DOCTYPE html><html></html>'])
        : createHttpsResponse(['<html>Hello world</html>']);
      callback(response);
      return new EventEmitter();
    });

    const handler = await loadHandlerWithHttps(httpsGet);
    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(new Map([['carbon', (_req, res) => res.status(200).json({ ok: true })]]));

    const response = await request(app).get('/api/scan/carbon');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('carbon')).toBe(true);
  });
});
