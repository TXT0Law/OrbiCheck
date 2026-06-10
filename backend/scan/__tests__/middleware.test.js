import { afterEach, describe, expect, it, jest } from '@jest/globals';

describe('common middleware direct invocation', () => {
  const originalApiTimeout = process.env.API_TIMEOUT_LIMIT;

  afterEach(() => {
    jest.resetModules();
    if (originalApiTimeout === undefined) {
      delete process.env.API_TIMEOUT_LIMIT;
    } else {
      process.env.API_TIMEOUT_LIMIT = originalApiTimeout;
    }
  });

  it('uses runner-provided timeoutMs instead of API_TIMEOUT_LIMIT for runDirect', async () => {
    process.env.API_TIMEOUT_LIMIT = '1000';
    jest.resetModules();
    const { default: middleware } = await import('../_common/middleware.js');
    const handler = middleware((_url, req) => new Promise((resolve) => {
      req.context.signal.addEventListener('abort', () => {
        resolve({ success: false, data: { aborted: true } });
      });
    }));

    const startedAt = Date.now();
    const envelope = await handler.runDirect(
      'https://example.com',
      { context: {} },
      { timeoutMs: 30 },
    );

    expect(Date.now() - startedAt).toBeLessThan(300);
    expect(envelope.success).toBe(false);
    expect(envelope.statusCode).toBe(408);
    expect(envelope.timedOut).toBe(true);
  });

  it('does not let API_TIMEOUT_LIMIT truncate a longer runner timeout for runDirect', async () => {
    process.env.API_TIMEOUT_LIMIT = '30';
    jest.resetModules();
    const { default: middleware } = await import('../_common/middleware.js');
    const handler = middleware(() => new Promise((resolve) => {
      setTimeout(() => resolve({ success: true, data: { ok: true } }), 100);
    }));

    const envelope = await handler.runDirect(
      'https://example.com',
      { context: {} },
      { timeoutMs: 1000 },
    );

    expect(envelope.success).toBe(true);
    expect(envelope.statusCode).toBe(200);
    expect(envelope.timedOut).not.toBe(true);
  });
});
