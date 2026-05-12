/**
 * C-5: page-source-rendered uses the shared Playwright browser pool to
 * fetch a JS-rendered HTML body. These tests cover the happy path,
 * the URL guard, and the wait-selector / wait-ms forwarding.
 */

import { jest } from '@jest/globals';

function createResponseCapture() {
  return {
    headersSent: false,
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.headersSent = true;
      this.body = body;
      return this;
    },
  };
}

async function loadHandlerWithMocks({ html = '<html><body>OK</body></html>', gotoStatus = 200, gotoError, contentError } = {}) {
  jest.resetModules();

  const fakePage = {
    goto: jest.fn().mockImplementation(async () => {
      if (gotoError) throw gotoError;
      return { status: () => gotoStatus };
    }),
    setDefaultTimeout: jest.fn(),
    waitForSelector: jest.fn().mockResolvedValue(undefined),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    content: jest.fn().mockImplementation(async () => {
      if (contentError) throw contentError;
      return html;
    }),
    isClosed: () => false,
    close: jest.fn().mockResolvedValue(undefined),
  };
  const fakeContext = {
    close: jest.fn().mockResolvedValue(undefined),
  };

  const withBrowserContext = jest.fn(async (fn) => fn(fakeContext, fakePage));

  await jest.unstable_mockModule('../_common/playwright-browser.js', () => ({
    withBrowserContext,
    launchChromium: jest.fn(),
    closeSharedBrowser: jest.fn(),
    __resetBrowserSingletonForTests: jest.fn(),
    BROWSER_MAX_CONTEXTS: 3,
  }));

  const { handler } = await import('../page-source-rendered.js');
  return { handler, fakePage };
}

async function invokeHandler(handler, url = 'https://example.com', query = {}) {
  const req = { query: { url, ...query } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('page-source-rendered module', () => {
  it('returns rendered HTML on success', async () => {
    const { handler } = await loadHandlerWithMocks({
      html: '<html><body><h1>Hello</h1></body></html>',
    });
    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.html).toContain('<h1>Hello</h1>');
    expect(response.body.data.statusCode).toBe(200);
    expect(response.body.data.renderMode).toBe('browser');
    expect(response.body.data.truncated).toBe(false);
  });

  it('returns 400 envelope when URL is missing', async () => {
    const { handler } = await loadHandlerWithMocks();
    const req = { query: {} };
    const res = createResponseCapture();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/no url/i);
  });

  it('forwards waitForSelector and waitForMs to the page', async () => {
    const { handler, fakePage } = await loadHandlerWithMocks();
    const response = await invokeHandler(handler, 'https://example.com', {
      waitForSelector: '.late-loaded',
      waitForMs: '300',
    });

    expect(response.statusCode).toBe(200);
    expect(fakePage.waitForSelector).toHaveBeenCalledWith(
      '.late-loaded',
      expect.objectContaining({ state: 'attached' }),
    );
    expect(fakePage.waitForTimeout).toHaveBeenCalledWith(300);
  });

  it('clamps oversized waitForMs to the configured ceiling', async () => {
    const { handler, fakePage } = await loadHandlerWithMocks();
    await invokeHandler(handler, 'https://example.com', {
      waitForMs: '99999',
    });

    expect(fakePage.waitForTimeout).toHaveBeenCalledWith(10000);
  });

  it('returns success envelope when waitForSelector times out', async () => {
    const { handler, fakePage } = await loadHandlerWithMocks();
    fakePage.waitForSelector.mockRejectedValueOnce(new Error('timeout'));

    const response = await invokeHandler(handler, 'https://example.com', {
      waitForSelector: '.never-appears',
    });

    // The page render should still succeed even when the selector never
    // attaches; otherwise a noisy SPA would always tank monitor probes.
    expect(response.body.success).toBe(true);
    expect(response.body.data.html).toContain('OK');
  });

  it('surfaces page navigation errors as failure envelope', async () => {
    const { handler } = await loadHandlerWithMocks({
      gotoError: new Error('TLS handshake failed'),
    });
    const response = await invokeHandler(handler);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('TLS handshake failed');
  });
});
