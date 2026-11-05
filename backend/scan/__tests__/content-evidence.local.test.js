import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import nodeHttp from 'http';

import { getHttpRetryPolicy } from '../_common/config.js';
import { circuitBreaker } from '../_common/circuit-breaker.js';
import linkedPages from '../linked-pages.js';
import pageSource from '../page-source.js';
import socialTags from '../social-tags.js';
import status from '../status.js';

let server;
let requests;
let target;
let responder;
beforeEach(async () => {
  circuitBreaker.reset();
  requests = 0;
  server = nodeHttp.createServer((req, res) => { requests += 1; responder(req, res); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  target = `http://127.0.0.1:${server.address().port}/`;
});
afterEach(async () => { await new Promise((resolve) => server.close(resolve)); });

it.each([403, 429, 503])('records actual HTTP %s with the configured bounded HEAD requests', async (code) => {
  responder = (_req, res) => { res.statusCode = code; res.end(); };
  expect(await status.runDirect(target)).toMatchObject({
    success: true, data: { fetchOutcome: 'http_response', responseCode: code, isUp: false },
  });
  const expectedRequests = code === 429 ? getHttpRetryPolicy().retries + 1 : 1;
  expect(requests).toBe(expectedRequests);
});

describe.each([['page-source', pageSource], ['social-tags', socialTags], ['linked-pages', linkedPages]])('%s local content', (_name, handler) => {
  it('rejects an HTTP denial page in one request', async () => {
    responder = (_req, res) => { res.statusCode = 403; res.end('<html>Denied</html>'); };
    expect(await handler.runDirect(target)).toMatchObject({ success: false, data: null });
    expect(requests).toBe(1);
  });
  it('rejects a 200 access challenge in one request', async () => {
    responder = (_req, res) => {
      res.setHeader('cf-mitigated', 'challenge');
      res.end('<html>Verify</html>');
    };
    expect(await handler.runDirect(target)).toMatchObject({ success: false, data: null });
    expect(requests).toBe(1);
  });
  it('rejects a redirected login form after two requests', async () => {
    responder = (req, res) => {
      if (req.url === '/') { res.writeHead(302, { Location: '/login' }); res.end(); return; }
      res.end('<html><input type="password"></html>');
    };
    expect(await handler.runDirect(target)).toMatchObject({ success: false, data: null });
    expect(requests).toBe(2);
  });
  it('accepts an ordinary Cloudflare JS detection script', async () => {
    responder = (_req, res) => { res.end('<html><script src="/cdn-cgi/challenge-platform/h/g/scripts/jsd/main.js"></script><a href="/about">About</a></html>'); };
    expect(await handler.runDirect(target)).toMatchObject({ success: true });
    expect(requests).toBe(1);
  });
  it('accepts a directly requested login page', async () => {
    responder = (_req, res) => { res.end('<html><input type="password"><a href="/help">Help</a></html>'); };
    expect(await handler.runDirect(target + 'login')).toMatchObject({ success: true });
    expect(requests).toBe(1);
  });
  it('accepts a directly requested login page after canonical redirect', async () => {
    responder = (req, res) => {
      if (req.url === '/login') { res.writeHead(302, { Location: '/login/' }); res.end(); return; }
      res.end('<html><input type="password"><a href="/help">Help</a></html>');
    };
    expect(await handler.runDirect(target + 'login')).toMatchObject({ success: true });
    expect(requests).toBe(2);
  });
  it('accepts normal redirected content after two requests', async () => {
    responder = (req, res) => {
      if (req.url === '/') { res.writeHead(302, { Location: '/home' }); res.end(); return; }
      res.end('<html><head><title>Login guide</title></head><a href="/about">About</a></html>');
    };
    expect(await handler.runDirect(target)).toMatchObject({ success: true });
    expect(requests).toBe(2);
  });
});
