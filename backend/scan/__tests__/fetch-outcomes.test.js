import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { circuitBreaker } from '../_common/circuit-breaker.js';
import { http } from '../_common/http.js';
import status from '../status.js';
import socialTags from '../social-tags.js';
import linkedPages from '../linked-pages.js';

const TARGET = 'https://outcomes.example/';
const originalAdapter = http.defaults.adapter;
afterEach(() => {
  http.defaults.adapter = originalAdapter;
  circuitBreaker.reset();
});

function respond(code, html = '<html><head><title>Blocked</title></head></html>', extra = {}) {
  const adapter = jest.fn(async (config) => ({ status: code, data: html, headers: {}, config, ...extra }));
  http.defaults.adapter = adapter;
  return adapter;
}

describe('target response versus module outcome', () => {
  it('does not invent status for a malformed transport response', async () => {
    const adapter = respond(undefined);
    expect(await status.runDirect(TARGET)).toMatchObject({ success: false, data: { fetchOutcome: 'network_error' } });
    expect(adapter).toHaveBeenCalledTimes(1);
  });
  it.each([403, 429, 503])('keeps measured HTTP %s as successful status evidence', async (code) => {
    const adapter = respond(code);
    const result = await status.runDirect(TARGET);
    expect(result).toMatchObject({ success: true, data: { responseCode: code, isUp: false } });
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['ENOTFOUND', 'dns_error'],
    ['CERT_HAS_EXPIRED', 'tls_error'],
    ['ERR_SSL_WRONG_VERSION_NUMBER', 'tls_error'],
    ['ECONNABORTED', 'timeout'],
    ['ECONNRESET', 'network_error'],
  ])('keeps %s separate from an HTTP response', async (code, outcome) => {
    const adapter = jest.fn(async () => { throw Object.assign(new Error(code), { code }); });
    http.defaults.adapter = adapter;
    const result = await status.runDirect(TARGET);
    expect(result).toMatchObject({ success: false, data: { fetchOutcome: outcome } });
    expect(JSON.stringify(result)).not.toContain('responseCode');
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it('records circuit-open without a target request', async () => {
    const adapter = respond(200);
    const { failureThreshold } = circuitBreaker.describe().policy;
    for (let count = 0; count < failureThreshold; count += 1) circuitBreaker.recordFailure(TARGET);
    expect(await status.runDirect(TARGET)).toMatchObject({ success: false, data: { fetchOutcome: 'circuit_open' } });
    expect(adapter).not.toHaveBeenCalled();
  });
});

describe.each([['social-tags', socialTags], ['linked-pages', linkedPages]])('%s content evidence', (_name, handler) => {
  it.each([403, 429, 503])('does not analyze an HTTP %s error page', async (code) => {
    const adapter = respond(code);
    expect(await handler.runDirect(TARGET)).toMatchObject({ success: false, data: null });
    expect(adapter).toHaveBeenCalledTimes(1);
  });
  it('does not analyze an explicit Cloudflare challenge', async () => {
    const adapter = respond(200, '<html><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script></html>');
    expect(await handler.runDirect(TARGET)).toMatchObject({ success: false, data: null });
    expect(adapter).toHaveBeenCalledTimes(1);
  });
  it('does not treat a login redirect as original site content', async () => {
    const adapter = respond(200, '<html><form><input type="password"></form></html>', {
      request: { res: { responseUrl: 'https://outcomes.example/login' } },
    });
    expect(await handler.runDirect(TARGET)).toMatchObject({ success: false, data: null });
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});
