/**
 * Live integration test for the full batch pipeline (TASK-P3-6).
 *
 * Status: SKIPPED BY DEFAULT.
 *
 * This test boots the real registry (loads all 34 scan modules) and runs a
 * batch scan against a real public target — `https://example.com` by default.
 * It is the broadest possible regression net for the scan service: if any
 * module produces a non-conforming envelope or hangs past the runner timeout,
 * this test will catch it.
 *
 * Because it makes ~30 outbound HTTP / DNS / Playwright calls, it must NEVER
 * run in `make test-osint`'s default path. To run locally:
 *
 *     SCAN_LIVE_TEST=1 SCAN_LIVE_TARGET=https://example.com \
 *       npm test -- --testPathPattern=batch.live
 *
 * Recommended for CI cron job (nightly or on release tags), not per-PR.
 *
 * Acceptance:
 *   - All discoverable modules return a well-formed envelope.
 *   - At least 80% report `success: true` on a healthy target.
 *   - Total wall-clock runtime stays under 90s.
 */

import { describe, expect, jest } from '@jest/globals';
import request from 'supertest';

import { app, setModulesForTest } from '../server.js';
import { loadModules } from '../registry.js';

const RUN_LIVE = process.env.SCAN_LIVE_TEST === '1' || process.env.SCAN_LIVE_TEST === 'true';
const LIVE_TARGET = process.env.SCAN_LIVE_TARGET || 'https://example.com';
const LIVE_TIMEOUT_MS = 90000;
const SUCCESS_THRESHOLD = 0.8;

// Use describe.skip when env flag is absent so the test still appears in the
// Jest report (visible reminder that opt-in coverage exists).
const describeOrSkip = RUN_LIVE ? describe : describe.skip;

describeOrSkip('batch live integration (P3-6)', () => {
  jest.setTimeout(LIVE_TIMEOUT_MS + 5000);

  it(`runs every loadable module against ${LIVE_TARGET} and returns a conformant envelope`, async () => {
    const modules = await loadModules();
    expect(modules.size).toBeGreaterThan(0);
    setModulesForTest(modules);

    const startedAt = Date.now();
    const response = await request(app)
      .post('/api/scan/batch')
      .send({ url: LIVE_TARGET })
      .timeout({ deadline: LIVE_TIMEOUT_MS });
    const elapsedMs = Date.now() - startedAt;

    expect(response.statusCode).toBe(200);
    expect(elapsedMs).toBeLessThan(LIVE_TIMEOUT_MS);

    const { results, totalModules, successCount } = response.body;
    expect(totalModules).toBe(modules.size);

    Object.entries(results).forEach(([name, envelope]) => {
      expect(envelope, `module ${name} returned non-object envelope`).toEqual(
        expect.objectContaining({
          success: expect.any(Boolean),
          durationMs: expect.any(Number),
        }),
      );
    });

    expect(successCount / totalModules).toBeGreaterThanOrEqual(SUCCESS_THRESHOLD);
  });
});
