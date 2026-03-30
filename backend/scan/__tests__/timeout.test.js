import { describe, expect, it } from '@jest/globals';
import { withTimeout } from '../utils/timeout.js';

describe('module timeout wrapper', () => {
  it('returns result when module completes within timeout', async () => {
    const fastFn = () => new Promise((r) => setTimeout(() => r({ ok: true }), 10));
    const result = await withTimeout(fastFn(), 1000, 'test');
    expect(result).toEqual({ ok: true });
  });

  it('rejects with timeout error when module exceeds timeout', async () => {
    const slowFn = () => new Promise((r) => setTimeout(() => r({ ok: true }), 500));
    await expect(withTimeout(slowFn(), 50, 'slowModule')).rejects.toThrow(/timed out/);
  });

  it('does not affect other modules when one times out', async () => {
    const fast1 = () => Promise.resolve({ id: 1 });
    const fast2 = () => Promise.resolve({ id: 2 });
    const slow = () => new Promise((r) => setTimeout(() => r({ id: 3 }), 200));

    const [r1, r2, r3] = await Promise.allSettled([
      withTimeout(fast1(), 100, 'm1'),
      withTimeout(slow(), 50, 'm2'),
      withTimeout(fast2(), 100, 'm3'),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r1.value).toEqual({ id: 1 });
    expect(r2.status).toBe('rejected');
    expect(r3.status).toBe('fulfilled');
    expect(r3.value).toEqual({ id: 2 });
  });
});
