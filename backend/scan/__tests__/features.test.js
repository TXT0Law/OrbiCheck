process.env.PLATFORM = 'NODE';
import { describe, expect, it } from '@jest/globals';

describe('features module', () => {

  it('returns success true with empty data when no API key', async () => {
    delete process.env.BUILT_WITH_API_KEY;

    const mod = await import('../features.js');
    const handler = mod.handler || mod.default;

    let capturedBody = null;
    const fakeReq = { query: { url: 'https://example.com' } };
    const fakeRes = {
      headersSent: false,
      statusCode: 200,
      status() { return this; },
      json(body) {
        this.headersSent = true;
        capturedBody = body;
      },
    };

    await handler(fakeReq, fakeRes);

    const body = capturedBody ?? {};
    expect(body.success).toBe(true);
    const data = body.data || {};
    expect(Array.isArray(data.features)).toBe(true);
    expect(data.features).toHaveLength(0);
    const note = data.note || '';
    expect(note.toLowerCase()).toContain('not configured');
    expect(note).toMatch(/BUILT_WITH_API_KEY|\.env\.example/);
  });

  it('does not throw when API key missing', async () => {
    delete process.env.BUILT_WITH_API_KEY;

    const mod = await import('../features.js');
    const handler = mod.handler || mod.default;

    const fakeReq = { query: { url: 'https://example.com' } };
    const fakeRes = {
      headersSent: false,
      statusCode: 200,
      status() { return this; },
      json() { this.headersSent = true; },
    };

    await handler(fakeReq, fakeRes);
  });
});
