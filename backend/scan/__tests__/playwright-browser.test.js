import { jest } from '@jest/globals';

describe('playwright-browser launchChromium', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH env var when set', async () => {
    const mockLaunch = jest.fn().mockResolvedValue({ pid: 1 });

    await jest.unstable_mockModule('playwright', () => ({
      chromium: { launch: mockLaunch },
    }));
    await jest.unstable_mockModule('node:fs', () => ({
      existsSync: jest.fn().mockReturnValue(false),
    }));

    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = '/custom/chromium';

    const { launchChromium } = await import('../_common/playwright-browser.js');
    await launchChromium();

    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: '/custom/chromium' }),
    );
  });

  it('falls back to first existing candidate path', async () => {
    const mockLaunch = jest.fn().mockResolvedValue({ pid: 2 });

    await jest.unstable_mockModule('playwright', () => ({
      chromium: { launch: mockLaunch },
    }));
    await jest.unstable_mockModule('node:fs', () => ({
      existsSync: jest.fn().mockImplementation(
        (p) => p === '/usr/bin/chromium-browser',
      ),
    }));

    const { launchChromium } = await import('../_common/playwright-browser.js');
    await launchChromium();

    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: '/usr/bin/chromium-browser' }),
    );
  });

  it('omits executablePath when no candidate exists and env var is unset', async () => {
    const mockLaunch = jest.fn().mockResolvedValue({ pid: 3 });

    await jest.unstable_mockModule('playwright', () => ({
      chromium: { launch: mockLaunch },
    }));
    await jest.unstable_mockModule('node:fs', () => ({
      existsSync: jest.fn().mockReturnValue(false),
    }));

    const { launchChromium } = await import('../_common/playwright-browser.js');
    await launchChromium();

    const callArgs = mockLaunch.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('executablePath');
  });

  it('passes additional launch options through to chromium.launch', async () => {
    const mockLaunch = jest.fn().mockResolvedValue({ pid: 4 });

    await jest.unstable_mockModule('playwright', () => ({
      chromium: { launch: mockLaunch },
    }));
    await jest.unstable_mockModule('node:fs', () => ({
      existsSync: jest.fn().mockReturnValue(false),
    }));

    const { launchChromium } = await import('../_common/playwright-browser.js');
    await launchChromium({ headless: true, args: ['--no-sandbox'] });

    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ headless: true, args: ['--no-sandbox'] }),
    );
  });

  it('env var takes precedence over filesystem candidates', async () => {
    const mockLaunch = jest.fn().mockResolvedValue({ pid: 5 });

    await jest.unstable_mockModule('playwright', () => ({
      chromium: { launch: mockLaunch },
    }));
    await jest.unstable_mockModule('node:fs', () => ({
      existsSync: jest.fn().mockReturnValue(true),
    }));

    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = '/override/chromium';

    const { launchChromium } = await import('../_common/playwright-browser.js');
    await launchChromium();

    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: '/override/chromium' }),
    );
  });
});

describe('withBrowserContext (P1-5 browser pool)', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    process.env.MAX_BROWSER_CONTEXTS = '2';
  });

  afterAll(() => {
    delete process.env.MAX_BROWSER_CONTEXTS;
  });

  function buildBrowserMock() {
    const newPage = jest.fn().mockResolvedValue({
      isClosed: () => false,
      close: jest.fn().mockResolvedValue(undefined),
    });
    const newContext = jest.fn().mockResolvedValue({
      newPage,
      cookies: jest.fn().mockResolvedValue([]),
      close: jest.fn().mockResolvedValue(undefined),
    });
    return {
      browser: {
        newContext,
        once: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
      },
      newContext,
      newPage,
    };
  }

  it('reuses a single browser across consecutive withBrowserContext calls', async () => {
    const mock = buildBrowserMock();
    const mockLaunch = jest.fn().mockResolvedValue(mock.browser);

    await jest.unstable_mockModule('playwright', () => ({
      chromium: { launch: mockLaunch },
    }));
    await jest.unstable_mockModule('node:fs', () => ({
      existsSync: jest.fn().mockReturnValue(false),
    }));

    const { withBrowserContext, __resetBrowserSingletonForTests } =
      await import('../_common/playwright-browser.js');
    __resetBrowserSingletonForTests();

    await withBrowserContext(async () => 'first');
    await withBrowserContext(async () => 'second');

    expect(mockLaunch).toHaveBeenCalledTimes(1);
    expect(mock.newContext).toHaveBeenCalledTimes(2);
  });

  it('respects MAX_BROWSER_CONTEXTS by queueing concurrent contexts', async () => {
    const mock = buildBrowserMock();
    const mockLaunch = jest.fn().mockResolvedValue(mock.browser);

    await jest.unstable_mockModule('playwright', () => ({
      chromium: { launch: mockLaunch },
    }));
    await jest.unstable_mockModule('node:fs', () => ({
      existsSync: jest.fn().mockReturnValue(false),
    }));

    const { withBrowserContext, __resetBrowserSingletonForTests } =
      await import('../_common/playwright-browser.js');
    __resetBrowserSingletonForTests();

    let inFlight = 0;
    let peak = 0;
    const work = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
    };

    await Promise.all(
      Array.from({ length: 5 }, () => withBrowserContext(work)),
    );

    expect(peak).toBeLessThanOrEqual(2);
    expect(mockLaunch).toHaveBeenCalledTimes(1);
  });

  it('closes the context even when the worker function throws', async () => {
    const mock = buildBrowserMock();
    const mockLaunch = jest.fn().mockResolvedValue(mock.browser);

    await jest.unstable_mockModule('playwright', () => ({
      chromium: { launch: mockLaunch },
    }));
    await jest.unstable_mockModule('node:fs', () => ({
      existsSync: jest.fn().mockReturnValue(false),
    }));

    const { withBrowserContext, __resetBrowserSingletonForTests } =
      await import('../_common/playwright-browser.js');
    __resetBrowserSingletonForTests();

    await expect(
      withBrowserContext(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const contextResult = await mock.newContext.mock.results[0].value;
    expect(contextResult.close).toHaveBeenCalled();
  });
});
