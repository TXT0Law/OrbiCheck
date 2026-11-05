import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { circuitBreaker } from '../_common/circuit-breaker.js';
import { http, httpWith } from '../_common/http.js';
import headers from '../headers.js';
import security from '../http-security.js';
import status from '../status.js';

const TARGET = 'https://evidence.example/';
const originalAdapter = http.defaults.adapter;

afterEach(() => {
  http.defaults.adapter = originalAdapter;
  circuitBreaker.reset();
});

describe('fetch evidence when a target is skipped', () => {
  it.each([['GET', '0'], ['HEAD', '0'], ['GET', '2'], ['HEAD', '2']])(
    'keeps skipped %s requests rejected with retry count %s',
    async (method, retries) => {
      const previousRetries = process.env.SCAN_HTTP_RETRY_COUNT;
      process.env.SCAN_HTTP_RETRY_COUNT = retries;
      try {
        const adapter = jest.fn();
        const client = httpWith({ adapter });
        const { failureThreshold } = circuitBreaker.describe().policy;
        for (let count = 0; count < failureThreshold; count += 1) {
          circuitBreaker.recordFailure(TARGET);
        }
        await expect(client.request({ url: TARGET, method })).rejects.toMatchObject({
          code: 'CIRCUIT_OPEN',
        });
        expect(adapter).not.toHaveBeenCalled();
      } finally {
        if (previousRetries === undefined) delete process.env.SCAN_HTTP_RETRY_COUNT;
        else process.env.SCAN_HTTP_RETRY_COUNT = previousRetries;
      }
    },
  );

  it('preserves headers from a real forbidden response', async () => {
    http.defaults.adapter = jest.fn(async (config) => ({
      status: 403,
      headers: { 'x-frame-options': 'DENY' },
      data: 'Forbidden',
      config,
    }));
    const result = await headers.runDirect(TARGET);
    expect(result).toMatchObject({ success: true, data: { 'x-frame-options': 'DENY' } });
    expect(http.defaults.adapter).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['headers', headers],
    ['http-security', security],
    ['status', status],
  ])('%s reports failure without invented findings or an outbound request', async (_name, handler) => {
    const adapter = jest.fn();
    http.defaults.adapter = adapter;
    const { failureThreshold } = circuitBreaker.describe().policy;
    for (let count = 0; count < failureThreshold; count += 1) {
      circuitBreaker.recordFailure(TARGET);
    }

    const result = await handler.runDirect(TARGET);

    expect(adapter).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, data: _name === 'status' ? { fetchOutcome: 'circuit_open' } : null });
    expect(result.error).toEqual(expect.any(String));
  });
});
