/**
 * Tests for `_common/host-limiter.js` (Task S-7).
 *
 * Validates that the per-host limiter:
 *   - caps simultaneous tasks against the same hostname,
 *   - allows different hostnames to run in parallel,
 *   - returns a passthrough limiter when no hostname is resolvable.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import {
  describeHostLimiters,
  getHostLimiter,
  resetHostLimiters,
  runUnderHostLimit,
} from '../_common/host-limiter.js';

beforeEach(() => {
  resetHostLimiters();
  delete process.env.SCAN_HOST_CONCURRENCY;
});

afterEach(() => {
  resetHostLimiters();
  delete process.env.SCAN_HOST_CONCURRENCY;
});

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('host-limiter (S-7)', () => {
  it('caps concurrent tasks per hostname at SCAN_HOST_CONCURRENCY', async () => {
    process.env.SCAN_HOST_CONCURRENCY = '2';
    resetHostLimiters(); // pick up the env override

    const inFlight = { count: 0, max: 0 };
    const blockers = [deferred(), deferred(), deferred(), deferred()];
    const task = (block) =>
      runUnderHostLimit('https://example.com/api', async () => {
        inFlight.count += 1;
        inFlight.max = Math.max(inFlight.max, inFlight.count);
        await block.promise;
        inFlight.count -= 1;
        return 'done';
      });

    const promises = blockers.map((b) => task(b));
    // Give the limiter a chance to schedule the first two tasks.
    await new Promise((resolve) => setImmediate(resolve));
    expect(inFlight.count).toBeLessThanOrEqual(2);

    for (const b of blockers) {
      b.resolve();
    }
    await Promise.all(promises);
    expect(inFlight.max).toBe(2);
  });

  it('runs different hostnames in parallel without contention', async () => {
    process.env.SCAN_HOST_CONCURRENCY = '1';
    resetHostLimiters();

    const inFlight = { a: 0, b: 0, maxParallel: 0 };
    const blockers = [deferred(), deferred()];
    const trackParallel = () => {
      const total = inFlight.a + inFlight.b;
      inFlight.maxParallel = Math.max(inFlight.maxParallel, total);
    };
    const taskA = runUnderHostLimit('https://a.example.com/', async () => {
      inFlight.a += 1;
      trackParallel();
      await blockers[0].promise;
      inFlight.a -= 1;
      return 'a';
    });
    const taskB = runUnderHostLimit('https://b.example.com/', async () => {
      inFlight.b += 1;
      trackParallel();
      await blockers[1].promise;
      inFlight.b -= 1;
      return 'b';
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(inFlight.maxParallel).toBe(2);

    blockers[0].resolve();
    blockers[1].resolve();
    await Promise.all([taskA, taskB]);
  });

  it('returns a passthrough limiter when input is empty', async () => {
    const limiter = getHostLimiter('');
    expect(limiter.host).toBe('');
    await expect(limiter.run(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('describeHostLimiters reflects active hosts', async () => {
    process.env.SCAN_HOST_CONCURRENCY = '1';
    resetHostLimiters();
    const block = deferred();
    const task = runUnderHostLimit('https://example.com', async () => {
      await block.promise;
      return 'done';
    });
    await new Promise((resolve) => setImmediate(resolve));
    const snap = describeHostLimiters();
    expect(snap.perHostConcurrency).toBe(1);
    expect(snap.hosts['example.com']).toBeDefined();
    block.resolve();
    await task;
  });
});
