// Lazy-shared Playwright Chromium instance.
// Modules that need a browser context (`screenshot`, `cookies`) call
// `withBrowserContext(fn, options)` which:
//   1. Reuses the singleton browser when available (fast hot path).
//   2. Cold-starts Chromium on first use; subsequent contexts are cheap
//      (`browser.newContext()` ~50ms vs ~700ms cold launch + 200MB RSS).
//   3. Tracks active contexts under a configurable `MAX_BROWSER_CONTEXTS`
//      semaphore so high-concurrency batches cannot exhaust memory.
//   4. Keeps the existing `launchChromium(options)` API working for legacy
//      callers and the test suite.
//
// On SIGTERM/SIGINT we close the singleton browser cleanly to avoid
// orphaned Chromium processes in containerised deployments.

import { existsSync } from 'node:fs';

import { chromium } from 'playwright';

import { createAbortError, throwIfAborted } from './abort.js';
import { logger } from './logger.js';

const CHROMIUM_CANDIDATES = [
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

const DEFAULT_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
];

const MAX_BROWSER_CONTEXTS = parseInt(
  process.env.MAX_BROWSER_CONTEXTS || '3',
  10,
);

let sharedBrowser = null;
let sharedBrowserPromise = null;
let activeContexts = 0;
const waitQueue = [];
let signalHandlersRegistered = false;

function pickExecutablePath() {
  return (
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    CHROMIUM_CANDIDATES.find((candidate) => existsSync(candidate))
  );
}

function registerSignalHandlersOnce() {
  if (signalHandlersRegistered) return;
  signalHandlersRegistered = true;
  const close = async () => {
    try {
      await closeSharedBrowser();
    } catch (error) {
      logger.warn(
        { error: error?.message || String(error) },
        'failed to close shared chromium during shutdown',
      );
    }
  };
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
}

async function ensureSharedBrowser(launchOverrides = {}) {
  if (sharedBrowser) return sharedBrowser;
  if (sharedBrowserPromise) return sharedBrowserPromise;

  sharedBrowserPromise = (async () => {
    const executablePath = pickExecutablePath();
    const launched = await chromium.launch({
      headless: true,
      args: DEFAULT_LAUNCH_ARGS,
      ...(executablePath ? { executablePath } : {}),
      ...launchOverrides,
    });
    launched.once('disconnected', () => {
      if (sharedBrowser === launched) {
        sharedBrowser = null;
        sharedBrowserPromise = null;
      }
    });
    sharedBrowser = launched;
    sharedBrowserPromise = null;
    registerSignalHandlersOnce();
    return launched;
  })();

  return sharedBrowserPromise;
}

async function acquireSlot(signal) {
  throwIfAborted(signal);
  if (activeContexts < MAX_BROWSER_CONTEXTS) {
    activeContexts += 1;
    return;
  }
  await new Promise((resolve, reject) => {
    const queued = { resolve, reject };
    const onAbort = () => {
      const index = waitQueue.indexOf(queued);
      if (index >= 0) waitQueue.splice(index, 1);
      reject(signal.reason || createAbortError());
    };
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
    queued.resolve = () => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      resolve();
    };
    waitQueue.push(queued);
  });
  throwIfAborted(signal);
  activeContexts += 1;
}

function releaseSlot() {
  activeContexts = Math.max(0, activeContexts - 1);
  const next = waitQueue.shift();
  if (next) next.resolve();
}

/**
 * Run `fn(context, page)` against a fresh Playwright BrowserContext on the
 * shared browser. The context is always closed afterwards. Errors thrown by
 * `fn` are propagated.
 *
 * @param {(context: import('playwright').BrowserContext, page: import('playwright').Page) => Promise<any>} fn
 * @param {object} [options]
 * @param {object} [options.contextOptions]   Forwarded to `browser.newContext()`.
 * @param {object} [options.launchOverrides]  Forwarded to the cold launch only.
 */
export async function withBrowserContext(fn, options = {}) {
  const signal = options.signal || null;
  await acquireSlot(signal);
  let context = null;
  let page = null;
  let abortCleanup = null;
  try {
    throwIfAborted(signal);
    const browser = await ensureSharedBrowser(options.launchOverrides || {});
    throwIfAborted(signal);
    context = await browser.newContext(options.contextOptions || {});
    page = await context.newPage();
    if (signal) {
      const onAbort = () => {
        page?.close?.().catch(() => {});
        context?.close?.().catch(() => {});
      };
      signal.addEventListener('abort', onAbort, { once: true });
      abortCleanup = () => signal.removeEventListener('abort', onAbort);
      throwIfAborted(signal);
    }
    return await fn(context, page);
  } finally {
    abortCleanup?.();
    if (page && !page.isClosed?.()) {
      await page.close().catch(() => {});
    }
    if (context) {
      await context.close().catch(() => {});
    }
    releaseSlot();
  }
}

/**
 * Legacy entry-point kept for tests and any code that wanted a raw browser.
 * Returns a *new* browser per call (preserves prior semantics) so test
 * mocks continue to work; production callers should prefer
 * `withBrowserContext`.
 */
export async function launchChromium(options = {}) {
  const executablePath = pickExecutablePath();
  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    ...options,
  });
}

/**
 * Close the shared browser if any. Safe to call multiple times.
 */
export async function closeSharedBrowser() {
  const browser = sharedBrowser;
  sharedBrowser = null;
  sharedBrowserPromise = null;
  if (browser) {
    try {
      await browser.close();
    } catch (error) {
      logger.warn(
        { error: error?.message || String(error) },
        'shared chromium close errored',
      );
    }
  }
}

// Test-only escape hatch: reset internal state so unit tests can verify
// reuse semantics without leaking Chromium processes between tests.
export function __resetBrowserSingletonForTests() {
  sharedBrowser = null;
  sharedBrowserPromise = null;
  activeContexts = 0;
  waitQueue.length = 0;
}

export const BROWSER_MAX_CONTEXTS = MAX_BROWSER_CONTEXTS;
