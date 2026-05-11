/**
 * Direct unit tests for `runner.js`.
 *
 * Covers the runModule contract that server.js / batch path rely on:
 *   - middleware-wrapped handler (handler.runDirect)
 *   - legacy Express-style handler (req/res.json)
 *   - timeout enforcement & 408 envelope
 *   - missing-handler guard
 *   - error masking
 *   - context propagation (scanId, traceId, logger)
 */

import { afterEach, beforeEach, describe, it, expect, jest } from '@jest/globals';

import { resetHostLimiters } from '../_common/host-limiter.js';
import { runModule } from '../runner.js';

function silentLogger() {
  const noop = () => {};
  return {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => silentLogger(),
  };
}

beforeEach(() => {
  resetHostLimiters();
});

afterEach(() => {
  resetHostLimiters();
  delete process.env.SCAN_HOST_CONCURRENCY;
});

describe('runner.js — runModule()', () => {
  it('calls handler.runDirect when present and returns the resulting envelope', async () => {
    const runDirect = jest.fn().mockResolvedValue({
      success: true,
      data: { ok: true },
      durationMs: 5,
      statusCode: 200,
    });
    const handler = jest.fn();
    handler.runDirect = runDirect;

    const envelope = await runModule({
      name: 'demo',
      handler,
      url: 'https://example.com',
      timeoutMs: 1000,
      logger: silentLogger(),
      context: { scanId: 'scan-1', traceId: 'trace-1' },
    });

    expect(runDirect).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
    const [calledUrl, calledReq, calledOpts] = runDirect.mock.calls[0];
    expect(calledUrl).toBe('https://example.com');
    expect(calledReq.context).toMatchObject({
      scanId: 'scan-1',
      traceId: 'trace-1',
    });
    expect(calledOpts).toMatchObject({ scanOptions: {} });
    expect(envelope).toMatchObject({ success: true, data: { ok: true } });
  });

  it('falls back to Express-style invocation when handler has no runDirect', async () => {
    const handler = jest.fn((_req, res) => res.status(200).json({ hello: 'world' }));

    const envelope = await runModule({
      name: 'demo',
      handler,
      url: 'https://example.com',
      timeoutMs: 1000,
      logger: silentLogger(),
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(envelope).toMatchObject({
      success: true,
      data: { hello: 'world' },
      statusCode: 200,
    });
  });

  it('forwards scanOptions into req.body and req.query for legacy handlers', async () => {
    let capturedReq = null;
    const handler = (req, res) => {
      capturedReq = req;
      res.status(200).json({ ok: true });
    };

    await runModule({
      name: 'demo',
      handler,
      url: 'https://example.com',
      scanOptions: { portScanProfile: 'deep' },
      timeoutMs: 1000,
      logger: silentLogger(),
    });

    expect(capturedReq.query.portScanProfile).toBe('deep');
    expect(capturedReq.body.scanOptions.portScanProfile).toBe('deep');
  });

  it('returns a 408 timeout envelope when handler exceeds timeoutMs', async () => {
    const handler = jest.fn(() => new Promise(() => {})); // never resolves

    const envelope = await runModule({
      name: 'slow',
      handler,
      url: 'https://example.com',
      timeoutMs: 30,
      logger: silentLogger(),
    });

    expect(envelope.success).toBe(false);
    expect(envelope.statusCode).toBe(408);
    expect(envelope.timedOut).toBe(true);
    expect(envelope.error).toMatch(/timed out/i);
  });

  it('masks unhandled exceptions thrown by the handler', async () => {
    const handler = () => {
      throw new Error('internal disk failure leaking PII');
    };

    const envelope = await runModule({
      name: 'broken',
      handler,
      url: 'https://example.com',
      timeoutMs: 1000,
      logger: silentLogger(),
    });

    expect(envelope.success).toBe(false);
    expect(envelope.error).toBe('Scan service request failed');
    // Critical: the original message must NOT leak to external callers.
    expect(envelope.error).not.toContain('internal disk failure');
    expect(envelope.error).not.toContain('PII');
  });

  it('returns an envelope (not throw) when the handler is missing/non-function', async () => {
    const envelope = await runModule({
      name: 'missing',
      handler: undefined,
      url: 'https://example.com',
      timeoutMs: 1000,
      logger: silentLogger(),
    });

    expect(envelope.success).toBe(false);
    expect(envelope.statusCode).toBe(500);
    expect(envelope.error).toContain("'missing'");
  });

  it('measures durationMs >= 0 even when handler reports 0/undefined', async () => {
    const handler = jest.fn().mockResolvedValue({ ok: true });

    const envelope = await runModule({
      name: 'demo',
      handler,
      url: 'https://example.com',
      timeoutMs: 1000,
      logger: silentLogger(),
    });

    expect(typeof envelope.durationMs).toBe('number');
    expect(envelope.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('logs through the bound logger.child(scanId, module) instead of root logger', async () => {
    const calls = [];
    const childLogger = {
      debug: () => {},
      info: () => {},
      warn: (...args) => calls.push(['warn', args]),
      error: (...args) => calls.push(['error', args]),
      child: jest.fn(),
    };
    const rootLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      child: jest.fn().mockReturnValue(childLogger),
    };

    const handler = () => {
      throw new Error('boom');
    };

    await runModule({
      name: 'broken',
      handler,
      url: 'https://example.com',
      timeoutMs: 1000,
      logger: rootLogger,
      context: { scanId: 'scan-xyz', traceId: 'trace-xyz' },
    });

    expect(rootLogger.child).toHaveBeenCalledWith({
      module: 'broken',
      scanId: 'scan-xyz',
    });
    expect(calls.some(([level]) => level === 'error')).toBe(true);
  });

  it('does NOT leak the timeout timer past completion (regression for "Force exiting" warning)', async () => {
    const handler = jest.fn().mockResolvedValue({ ok: true });

    // Track all setTimeout calls during this test.
    const realSetTimeout = global.setTimeout;
    const realClearTimeout = global.clearTimeout;
    const liveTimers = new Set();
    global.setTimeout = (fn, ms, ...rest) => {
      const id = realSetTimeout(fn, ms, ...rest);
      liveTimers.add(id);
      return id;
    };
    global.clearTimeout = (id) => {
      liveTimers.delete(id);
      return realClearTimeout(id);
    };

    try {
      await runModule({
        name: 'fast',
        handler,
        url: 'https://example.com',
        timeoutMs: 30000,
        logger: silentLogger(),
      });
      // The runner-owned timeout timer must have been cleared on completion.
      expect(liveTimers.size).toBe(0);
    } finally {
      global.setTimeout = realSetTimeout;
      global.clearTimeout = realClearTimeout;
    }
  });

  it('B-5: host-limiter queue wait does not count against module timeout', async () => {
    // Reduce the per-host concurrency to 1 so the second runModule call has
    // to queue behind the first. The first runModule blocks for ~80 ms; the
    // second runs with an aggressive 50 ms timeout. If queue wait counted
    // against the timeout, the second would 408. Under the B-5 contract it
    // must succeed because the timer only starts after the slot is acquired.
    process.env.SCAN_HOST_CONCURRENCY = '1';
    resetHostLimiters();

    const slowHandler = jest.fn(() => new Promise((resolve) => {
      setTimeout(() => resolve({ success: true, data: { who: 'slow' } }), 80);
    }));
    const fastHandler = jest.fn(() => Promise.resolve({ success: true, data: { who: 'fast' } }));

    const slowPromise = runModule({
      name: 'slow',
      handler: slowHandler,
      url: 'https://shared-host.example.com/a',
      timeoutMs: 5000,
      logger: silentLogger(),
    });
    const fastPromise = runModule({
      name: 'fast',
      handler: fastHandler,
      url: 'https://shared-host.example.com/b',
      timeoutMs: 50,
      logger: silentLogger(),
    });

    const [slow, fast] = await Promise.all([slowPromise, fastPromise]);
    expect(slow.success).toBe(true);
    expect(fast.success).toBe(true);
    expect(fast.timedOut).not.toBe(true);
  });
});
