/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import {
  technologiesFromResponseHeaders,
  detectTechFromHeaders,
} from '../_common/tech-stack-fallback.js';

describe('tech-stack-fallback', () => {
  it('detects nginx and php from headers', () => {
    const headers = new Headers({
      server: 'nginx/1.22.0',
      'x-powered-by': 'PHP/8.2',
    });
    const techs = technologiesFromResponseHeaders(headers);
    const names = techs.map((t) => t.name);
    expect(names.some((n) => /nginx/i.test(n))).toBe(true);
    expect(names).toContain('PHP');
  });

  it('detects Cloudflare from cf-ray', () => {
    const headers = new Headers({
      server: 'cloudflare',
      'cf-ray': 'abc-ORD',
    });
    const techs = technologiesFromResponseHeaders(headers);
    expect(techs.map((t) => t.name)).toContain('Cloudflare');
  });

  it('sends OrbiCheck-Scan User-Agent when fetching headers', async () => {
    let capturedUA;
    const spy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, opts) => {
      capturedUA = opts?.headers?.['User-Agent'];
      return new Response('', { headers: { server: 'nginx' } });
    });

    await detectTechFromHeaders('https://example.com');
    expect(capturedUA).toMatch(/OrbiCheck-Scan\/1\.0/);
    spy.mockRestore();
  });

  it('returns empty technologies for blank url', async () => {
    const result = await detectTechFromHeaders('');
    expect(result.technologies).toEqual([]);
  });
});
