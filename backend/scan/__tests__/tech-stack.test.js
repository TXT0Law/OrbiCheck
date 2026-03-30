/**
 * Tests for tech-stack module.
 * Uses mocked handlers; real Wappalyzer detection runs in worker subprocess.
 * Anti-bot sites may block headless browsers and return empty results.
 */

import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

describe('tech-stack module', () => {
  it('returns technologies array when detection succeeds', async () => {
    const mockTechStack = (_req, res) => {
      res.status(200).json({
        technologies: [
          { name: 'React', categories: [{ name: 'JavaScript Framework' }], confidence: 100 },
        ],
        duration_ms: 2000,
      });
    };

    setModulesForTest(new Map([['tech-stack', mockTechStack]]));

    const response = await request(app)
      .get('/api/scan/tech-stack')
      .query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(200);
    const body = response.body;
    expect(Array.isArray(body.technologies)).toBe(true);
    expect(body.technologies).toHaveLength(1);
    expect(body.technologies[0].name).toBe('React');
  });

  it('returns empty technologies when blocked or timed out', async () => {
    const mockEmpty = (_req, res) => {
      res.status(200).json({
        technologies: [],
        error: 'Tech-stack detection timed out after 30000ms',
        duration_ms: 30001,
      });
    };

    setModulesForTest(new Map([['tech-stack', mockEmpty]]));

    const response = await request(app)
      .get('/api/scan/tech-stack')
      .query({ url: 'https://example.com' });

    expect(response.statusCode).toBe(200);
    const body = response.body;
    expect(Array.isArray(body.technologies)).toBe(true);
    expect(body.technologies).toHaveLength(0);
  });
});
