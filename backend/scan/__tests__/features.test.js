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

  // P2-9: BuiltWith API key handling regressions ----------------------------
  describe('redactApiKey (P2-9 secret hygiene)', () => {
    it('redacts the raw API key from arbitrary strings', async () => {
      const { redactApiKey } = await import('../features.js');
      const key = 'secret-builtwith-key-12345';
      const url = `https://api.builtwith.com/free1/api.json?KEY=${key}&LOOKUP=example.com`;
      expect(redactApiKey(url, key)).not.toContain(key);
      expect(redactApiKey(url, key)).toContain('***REDACTED***');
    });

    it('redacts URL-encoded variants too', async () => {
      const { redactApiKey } = await import('../features.js');
      const key = 'has spaces+and/specials';
      const encoded = encodeURIComponent(key);
      expect(redactApiKey(`url ${encoded} more`, key)).not.toContain(encoded);
    });

    it('returns the input unchanged when no key is configured', async () => {
      const { redactApiKey } = await import('../features.js');
      expect(redactApiKey('plain string', '')).toBe('plain string');
      expect(redactApiKey('plain string', undefined)).toBe('plain string');
    });

    it('handles non-string input safely', async () => {
      const { redactApiKey } = await import('../features.js');
      expect(redactApiKey(null, 'k')).toBeNull();
      expect(redactApiKey(undefined, 'k')).toBeUndefined();
    });
  });
});
