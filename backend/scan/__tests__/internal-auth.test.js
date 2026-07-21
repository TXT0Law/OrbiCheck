import request from 'supertest';

import {
  buildInternalAuthHeaders,
  validateInternalAuthConfiguration,
} from '../_common/internal-auth.js';
import { app, setModulesForTest } from '../server.js';

const SECRET = 'test-internal-service-secret-that-is-long';

describe('scan service internal authentication', () => {
  beforeEach(() => {
    process.env.INTERNAL_SERVICE_AUTH_REQUIRED = 'true';
    process.env.INTERNAL_SERVICE_SECRET = SECRET;
    setModulesForTest(new Map());
  });

  afterEach(() => {
    delete process.env.INTERNAL_SERVICE_AUTH_REQUIRED;
    delete process.env.INTERNAL_SERVICE_SECRET;
  });

  it('rejects unsigned internal API requests', async () => {
    const response = await request(app).get('/api/scan/modules');

    expect(response.statusCode).toBe(401);
    expect(response.body.code).toBe('INTERNAL_AUTH_EXPIRED');
  });

  it('accepts a fresh valid signature', async () => {
    const headers = buildInternalAuthHeaders({
      secret: SECRET,
      method: 'GET',
      target: '/api/scan/modules',
    });

    const response = await request(app)
      .get('/api/scan/modules')
      .set(headers);

    expect(response.statusCode).toBe(200);
    expect(response.body.modules).toEqual([]);
  });

  it('rejects a signature for a different request target', async () => {
    const headers = buildInternalAuthHeaders({
      secret: SECRET,
      method: 'GET',
      target: '/api/scan/config',
    });

    const response = await request(app)
      .get('/api/scan/modules')
      .set(headers);

    expect(response.statusCode).toBe(401);
    expect(response.body.code).toBe('INTERNAL_AUTH_INVALID');
  });

  it('leaves health unauthenticated for container probes', async () => {
    const response = await request(app).get('/health');

    expect(response.statusCode).toBe(200);
  });

  it('does not emit browser CORS permission headers', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', 'https://attacker.example');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('fails production startup for a missing or placeholder secret', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.INTERNAL_SERVICE_SECRET;
    expect(() => validateInternalAuthConfiguration()).toThrow(/at least/);

    process.env.INTERNAL_SERVICE_SECRET = 'dev-only-internal-service-secret-that-is-long';
    expect(() => validateInternalAuthConfiguration()).toThrow(/placeholder/);

    process.env.INTERNAL_SERVICE_SECRET = 'a'.repeat(48);
    expect(() => validateInternalAuthConfiguration()).not.toThrow();
    process.env.NODE_ENV = 'test';
  });
});
