/**
 * Integration tests for `_common/http.js` (TASK-P3-5, updated for S-1/S-2).
 *
 * Spins up a tiny in-process HTTP server and verifies that the shared
 * axios instance:
 *
 *   - retries idempotent requests on 429 responses,
 *   - by default leaves 5xx alone (S-2): caller surfaces the upstream
 *     status without amplifying load on a target that is already in
 *     distress,
 *   - opt-in retries 5xx when `SCAN_HTTP_RETRY_5XX=true`,
 *   - honours the `SCAN_HTTP_RETRY_COUNT=0` kill-switch (no retry, just one
 *     request — important when an operator wants to reproduce a flaky
 *     upstream without retry noise).
 *
 * Using a real socket instead of axios-retry's internal helpers gives us
 * real backoff/abort behaviour and would catch regressions where the retry
 * interceptor stops being attached.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import http from 'http';

import { circuitBreaker } from '../_common/circuit-breaker.js';
import { httpWith } from '../_common/http.js';

let server;
let port;
let requestCount;
let respondWith;

beforeEach(async () => {
  // S-1: prevent earlier tests from leaking an open breaker into this case
  // (all of them target 127.0.0.1, so cross-test state would be visible).
  circuitBreaker.reset();
  requestCount = 0;
  respondWith = [];
  server = http.createServer((req, res) => {
    requestCount += 1;
    const choice = respondWith.shift() ?? { status: 200, body: 'ok' };
    res.statusCode = choice.status;
    res.setHeader('Content-Type', 'text/plain');
    res.end(choice.body || '');
  });
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function urlFor(path) {
  return `http://127.0.0.1:${port}${path}`;
}

describe('http.js — axios-retry + circuit breaker wiring', () => {
  it('does NOT retry on 5xx by default (S-2: avoid amplifying load on degraded targets)', async () => {
    respondWith = [
      { status: 503, body: 'unavailable' },
      { status: 200, body: 'never reached' },
    ];
    const client = httpWith({ timeout: 2000 });

    const response = await client.get(urlFor('/health'));

    expect(response.status).toBe(503);
    expect(requestCount).toBe(1);
  });

  it('retries 5xx when SCAN_HTTP_RETRY_5XX=true is set', async () => {
    process.env.SCAN_HTTP_RETRY_5XX = 'true';
    try {
      respondWith = [
        { status: 503, body: 'down' },
        { status: 503, body: 'down' },
        { status: 200, body: 'recovered' },
      ];
      const client = httpWith({ timeout: 2000 });

      const response = await client.get(urlFor('/health'));

      expect(response.status).toBe(200);
      expect(requestCount).toBe(3);
    } finally {
      delete process.env.SCAN_HTTP_RETRY_5XX;
    }
  });

  it('retries on 429 (rate limited)', async () => {
    respondWith = [
      { status: 429, body: 'slow down' },
      { status: 200, body: 'ok' },
    ];
    const client = httpWith({ timeout: 2000 });

    const response = await client.get(urlFor('/'));

    expect(response.status).toBe(200);
    expect(requestCount).toBe(2);
  });

  it('surfaces the last 5xx response without retrying (default policy)', async () => {
    respondWith = [
      { status: 503, body: 'down' },
      { status: 503, body: 'down' },
    ];
    const client = httpWith({ timeout: 2000 });

    const response = await client.get(urlFor('/'));

    expect(response.status).toBe(503);
    expect(requestCount).toBe(1);
  });

  it('honours SCAN_HTTP_RETRY_COUNT=0 (disable retries)', async () => {
    process.env.SCAN_HTTP_RETRY_COUNT = '0';
    try {
      respondWith = [
        { status: 503, body: 'down' },
        { status: 200, body: 'never reached' },
      ];
      const client = httpWith({ timeout: 2000 });

      const response = await client.get(urlFor('/'));

      expect(response.status).toBe(503);
      expect(requestCount).toBe(1);
    } finally {
      delete process.env.SCAN_HTTP_RETRY_COUNT;
    }
  });

  it('does not retry on 4xx (non-429) — those are caller errors', async () => {
    respondWith = [
      { status: 404, body: 'not found' },
      { status: 200, body: 'never' },
    ];
    const client = httpWith({ timeout: 2000 });

    const response = await client.get(urlFor('/'));

    expect(response.status).toBe(404);
    expect(requestCount).toBe(1);
  });

  it('short-circuits to 503 once the per-host breaker is open (S-1)', async () => {
    // Pre-trip the breaker by recording 3 consecutive failures directly,
    // matching the default threshold. The next request must NOT touch the
    // network.
    circuitBreaker.recordFailure(urlFor('/'));
    circuitBreaker.recordFailure(urlFor('/'));
    circuitBreaker.recordFailure(urlFor('/'));

    const client = httpWith({ timeout: 2000 });
    const response = await client.get(urlFor('/'));

    expect(response.status).toBe(503);
    expect(response.data).toEqual(
      expect.objectContaining({ error: 'circuit_breaker_open' }),
    );
    expect(requestCount).toBe(0);
  });
});
