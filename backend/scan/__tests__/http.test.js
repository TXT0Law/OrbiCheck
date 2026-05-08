/**
 * Integration tests for `_common/http.js` (TASK-P3-5).
 *
 * Spins up a tiny in-process HTTP server and verifies that the shared
 * axios instance:
 *
 *   - retries idempotent requests on 5xx and 429 responses,
 *   - eventually surfaces the *last* response when retries are exhausted,
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

import { httpWith } from '../_common/http.js';

let server;
let port;
let requestCount;
let respondWith;

beforeEach(async () => {
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

describe('http.js — axios-retry wiring (P3-5)', () => {
  it('retries on 503 then succeeds, surfacing the final 200 response', async () => {
    respondWith = [
      { status: 503, body: 'unavailable' },
      { status: 503, body: 'unavailable' },
      { status: 200, body: 'finally' },
    ];
    const client = httpWith({ timeout: 2000 });

    const response = await client.get(urlFor('/health'));

    expect(response.status).toBe(200);
    expect(response.data).toBe('finally');
    expect(requestCount).toBe(3);
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

  it('returns the last 5xx response when retry budget is exhausted', async () => {
    respondWith = [
      { status: 503, body: 'down' },
      { status: 503, body: 'down' },
      { status: 503, body: 'down' },
      { status: 503, body: 'down' },
    ];
    const client = httpWith({ timeout: 2000 });

    const response = await client.get(urlFor('/'));

    // SCAN_HTTP_RETRY_COUNT defaults to 2 (so 1 initial + 2 retries = 3 total)
    expect(response.status).toBe(503);
    expect(requestCount).toBe(3);
  });

  it('honours SCAN_HTTP_RETRY_COUNT=0 (disable retries)', async () => {
    process.env.SCAN_HTTP_RETRY_COUNT = '0';
    respondWith = [
      { status: 503, body: 'down' },
      { status: 200, body: 'never reached' },
    ];
    // httpWith() reads the policy at instance-creation time so we must
    // create the instance *after* mutating the env variable.
    const client = httpWith({ timeout: 2000 });

    const response = await client.get(urlFor('/'));

    expect(response.status).toBe(503);
    expect(requestCount).toBe(1);

    delete process.env.SCAN_HTTP_RETRY_COUNT;
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
});
