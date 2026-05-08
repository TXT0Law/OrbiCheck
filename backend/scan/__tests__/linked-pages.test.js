import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

const TARGET_URL = 'https://example.com';

describe('linked-pages module', () => {
  afterEach(() => {
    setModulesForTest(new Map());
  });

  it('returns internal and external links on success', async () => {
    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: true,
        data: {
          internal: ['https://example.com/', 'https://example.com/about'],
          external: ['https://github.com/example'],
        },
        error: null,
        duration_ms: 10,
      });
    };

    setModulesForTest(new Map([['linked-pages', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/linked-pages')
      .query({ url: TARGET_URL });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data.internal)).toBe(true);
    expect(Array.isArray(response.body.data.external)).toBe(true);
    expect(response.body.data.internal[0]).toContain('example.com');
    expect(response.body.durationMs).toEqual(expect.any(Number));
  });

  it('returns empty link collections gracefully', async () => {
    const mockHandler = (_req, res) => {
      res.status(200).json({
        success: true,
        data: {
          internal: [],
          external: [],
        },
        error: null,
        duration_ms: 2,
      });
    };

    setModulesForTest(new Map([['linked-pages', mockHandler]]));

    const response = await request(app)
      .get('/api/scan/linked-pages')
      .query({ url: TARGET_URL });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.internal).toEqual([]);
    expect(response.body.data.external).toEqual([]);
  });

  it('masks unexpected module errors', async () => {
    setModulesForTest(
      new Map([
        [
          'linked-pages',
          () => {
            throw new Error('links exploded');
          },
        ],
      ])
    );

    const response = await request(app)
      .get('/api/scan/linked-pages')
      .query({ url: TARGET_URL });

    expect(response.statusCode).toBe(500);
    expect(response.body.error).toBe('Scan service request failed');
    expect(response.body.stack).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('links exploded');
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(new Map([['linked-pages', (_req, res) => res.status(200).json({})]]));

    const response = await request(app).get('/api/scan/linked-pages');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('linked-pages')).toBe(true);
  });

  // P2-7 hostname-based same-origin classification regression -----------------
  describe('classifyLinks (P2-7 hostname check)', () => {
    let classifyLinks;

    beforeAll(async () => {
      ({ classifyLinks } = await import('../linked-pages.js'));
    });

    it('treats links with the exact same hostname as internal', () => {
      const html = `
        <a href="/about">About</a>
        <a href="https://example.com/contact">Contact</a>
        <a href="https://example.com/team?x=1">Team</a>
      `;
      const { internal, external } = classifyLinks(html, 'https://example.com');
      expect(internal).toEqual(expect.arrayContaining([
        'https://example.com/about',
        'https://example.com/contact',
        'https://example.com/team?x=1',
      ]));
      expect(external).toEqual([]);
    });

    it('does NOT classify suffix-matching attacker domains as internal', () => {
      const html = `
        <a href="https://example.com.evil.com/x">Phish</a>
        <a href="https://example.com/legit">Legit</a>
      `;
      const { internal, external } = classifyLinks(html, 'https://example.com');
      expect(internal).toEqual(['https://example.com/legit']);
      expect(external).toEqual(['https://example.com.evil.com/x']);
    });

    it('treats third-party http/https links as external', () => {
      const html = `
        <a href="https://github.com/orbicheck">Github</a>
        <a href="http://google.com/">Google</a>
        <a href="/internal">Internal</a>
      `;
      const { internal, external } = classifyLinks(html, 'https://example.com');
      expect(internal).toEqual(['https://example.com/internal']);
      // urlLib.resolve normalises bare hostnames to include a trailing slash;
      // we just care that both end up in the external bucket.
      expect(external).toEqual(expect.arrayContaining([
        'https://github.com/orbicheck',
        'http://google.com/',
      ]));
      expect(external).toHaveLength(2);
    });

    it('skips invalid href values without crashing', () => {
      const html = `
        <a href="">Empty</a>
        <a href="javascript:void(0)">JS</a>
        <a href="https://example.com/ok">Good</a>
      `;
      const { internal, external } = classifyLinks(html, 'https://example.com');
      expect(internal).toEqual(['https://example.com/ok']);
      expect(external).toEqual([]);
    });

    it('counts duplicates and sorts most-frequent first', () => {
      const html = `
        <a href="/a">A</a>
        <a href="/b">B</a>
        <a href="/a">A again</a>
        <a href="/a">A again 2</a>
      `;
      const { internal } = classifyLinks(html, 'https://example.com');
      expect(internal[0]).toBe('https://example.com/a');
      expect(internal[1]).toBe('https://example.com/b');
    });
  });
});
