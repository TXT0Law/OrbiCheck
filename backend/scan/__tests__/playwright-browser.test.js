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
