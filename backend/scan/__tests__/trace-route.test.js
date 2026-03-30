import request from 'supertest';

import { app, setModulesForTest } from '../server.js';
import { handler } from '../trace-route.js';

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

async function invokeHandler(url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('trace-route module', () => {
  afterEach(() => {
    setModulesForTest(new Map());
  });

  it('returns a disabled traceroute payload on success', async () => {
    const response = await invokeHandler();

    expect(response.statusCode).toBe(200);
    expect(response.body.message).toContain('temporarily disabled');
    expect(response.body.result).toEqual([]);
    expect(response.body.warning).toContain('example.com');
  });

  it('returns an empty traceroute result gracefully', async () => {
    const response = await invokeHandler('https://sub.example.com');

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body.result)).toBe(true);
    expect(response.body.result).toHaveLength(0);
  });

  it('returns a generic error when the hostname is invalid', async () => {
    const response = await invokeHandler('https:///');

    expect(response.statusCode).toBe(500);
    expect(response.body.error).toBe('Request failed while processing this scan module.');
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(new Map([['trace-route', (_req, res) => res.status(200).json({ ok: true })]]));

    const routeResponse = await request(app).get('/api/scan/trace-route');

    expect(routeResponse.statusCode).toBe(400);
    expect(routeResponse.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('trace-route')).toBe(true);
  });
});
