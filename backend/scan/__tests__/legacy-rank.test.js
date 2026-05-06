import { EventEmitter } from 'events';
import { jest } from '@jest/globals';
import os from 'os';
import path from 'path';
import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

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

function createCsvParser(rows, error = null) {
  const handlers = {};
  return {
    destroy: jest.fn(),
    on(event, callback) {
      handlers[event] = callback;
      if (event === 'end' || event === 'error') {
        process.nextTick(() => {
          if (error) {
            handlers.error?.(error);
            return;
          }
          rows.forEach((row) => handlers.data?.(row));
          handlers.end?.();
        });
      }
      return this;
    },
  };
}

async function loadHandlerWithMocks({
  axiosMock,
  fsMock,
  unzipperMock,
  csvFactory,
}) {
  jest.resetModules();
  await jest.unstable_mockModule('axios', () => ({
    default: axiosMock,
  }));
  await jest.unstable_mockModule('fs', () => ({
    default: fsMock,
  }));
  await jest.unstable_mockModule('unzipper', () => ({
    default: unzipperMock,
  }));
  await jest.unstable_mockModule('csv-parser', () => ({
    default: csvFactory,
  }));
  const mod = await import('../legacy-rank.js');
  return mod;
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('legacy-rank module', () => {
  afterEach(() => {
    setModulesForTest(new Map());
  });

  it('returns rank data on success and downloads the csv into os.tmpdir() under the zip-internal filename', async () => {
    const parser = createCsvParser([{ rank: '42', domain: 'example.com' }]);
    const extractor = new EventEmitter();
    const expectedTempPath = path.join(os.tmpdir(), 'top-1m.csv');
    const axiosMock = jest.fn().mockResolvedValue({
      data: {
        pipe: () => {
          process.nextTick(() => extractor.emit('close'));
          return extractor;
        },
      },
    });
    const sourceStream = { pipe: jest.fn().mockReturnValue(parser), on: jest.fn().mockReturnThis() };
    const fsMock = {
      existsSync: jest.fn()
        .mockImplementationOnce(() => false)
        .mockImplementation(() => true),
      createReadStream: jest.fn().mockReturnValue(sourceStream),
    };
    const unzipperMock = {
      Extract: jest.fn().mockReturnValue(extractor),
    };
    const { handler, __resetLegacyRankCacheForTests } = await loadHandlerWithMocks({
      axiosMock,
      fsMock,
      unzipperMock,
      csvFactory: jest.fn().mockReturnValue(parser),
    });
    __resetLegacyRankCacheForTests();

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      domain: 'example.com',
      rank: '42',
      isFound: true,
    });
    expect(axiosMock).toHaveBeenCalled();
    expect(unzipperMock.Extract).toHaveBeenCalledTimes(1);
    expect(unzipperMock.Extract).toHaveBeenCalledWith({ path: os.tmpdir() });
    expect(fsMock.createReadStream).toHaveBeenCalledWith(expectedTempPath);
  });

  it('returns a skipped payload when the domain is not found in the csv', async () => {
    const parser = createCsvParser([{ rank: '77', domain: 'other.com' }]);
    const sourceStream = { pipe: jest.fn().mockReturnValue(parser), on: jest.fn().mockReturnThis() };
    const { handler, __resetLegacyRankCacheForTests } = await loadHandlerWithMocks({
      axiosMock: jest.fn(),
      fsMock: {
        existsSync: jest.fn().mockReturnValue(true),
        createReadStream: jest.fn().mockReturnValue(sourceStream),
      },
      unzipperMock: {
        Extract: jest.fn(),
      },
      csvFactory: jest.fn().mockReturnValue(parser),
    });
    __resetLegacyRankCacheForTests();

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.isFound).toBe(false);
    expect(response.body.skipped).toContain('not present in the Umbrella top 1M list');
  });

  it('rejects gracefully when the extracted CSV is missing instead of crashing the process (regression for ENOENT)', async () => {
    const extractor = new EventEmitter();
    extractor.pipe = () => extractor;
    const axiosMock = jest.fn().mockResolvedValue({
      data: {
        pipe: () => {
          process.nextTick(() => extractor.emit('close'));
          return extractor;
        },
      },
    });
    const { handler, __resetLegacyRankCacheForTests } = await loadHandlerWithMocks({
      axiosMock,
      fsMock: {
        existsSync: jest.fn().mockReturnValue(false),
        createReadStream: jest.fn(() => {
          throw new Error('test should not reach createReadStream');
        }),
      },
      unzipperMock: { Extract: jest.fn().mockReturnValue(extractor) },
      csvFactory: jest.fn(),
    });
    __resetLegacyRankCacheForTests();

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    // The middleware swallows the specific reason and returns its generic
    // failure payload, but crucially the Node process must NOT crash here.
    expect(response.body.error).toBeDefined();
  });

  it('propagates a source-stream error as a rejected promise, not as a process-level "uncaught error" (regression for unhandled error event)', async () => {
    // A "silent" parser that never emits end/data — forcing the source-error
    // path to be the only resolution channel.
    const silentParser = {
      on: jest.fn().mockReturnThis(),
    };
    let sourceErrorHandler = null;
    const sourceStream = {
      pipe: jest.fn().mockReturnValue(silentParser),
      on(event, listener) {
        if (event === 'error') sourceErrorHandler = listener;
        return sourceStream;
      },
    };
    const { handler, __resetLegacyRankCacheForTests } = await loadHandlerWithMocks({
      axiosMock: jest.fn(),
      fsMock: {
        existsSync: jest.fn().mockReturnValue(true),
        createReadStream: jest.fn().mockReturnValue(sourceStream),
      },
      unzipperMock: { Extract: jest.fn() },
      csvFactory: jest.fn().mockReturnValue(silentParser),
    });
    __resetLegacyRankCacheForTests();

    const handlerPromise = invokeHandler(handler);
    // Wait for the handler to wire up listeners on the source stream.
    await new Promise((resolve) => setImmediate(resolve));
    expect(sourceErrorHandler).not.toBeNull();
    sourceErrorHandler(new Error('disk read failed'));

    const response = await handlerPromise;
    expect(response.statusCode).toBe(500);
  });

  it('caches the parsed rank table across invocations (single download + single parse)', async () => {
    const buildParser = () => createCsvParser([
      { rank: '1', domain: 'one.com' },
      { rank: '2', domain: 'example.com' },
    ]);
    const csvFactory = jest.fn(() => buildParser());
    const axiosMock = jest.fn();
    const extractor = new EventEmitter();
    extractor.pipe = () => extractor;
    const buildSourceStream = () => ({
      pipe: jest.fn(() => csvFactory()),
      on: jest.fn().mockReturnThis(),
    });
    const fsMock = {
      existsSync: jest.fn().mockReturnValue(true),
      createReadStream: jest.fn(() => buildSourceStream()),
    };
    const unzipperMock = { Extract: jest.fn().mockReturnValue(extractor) };
    const { handler, __resetLegacyRankCacheForTests } = await loadHandlerWithMocks({
      axiosMock,
      fsMock,
      unzipperMock,
      csvFactory,
    });
    __resetLegacyRankCacheForTests();

    const first = await invokeHandler(handler, 'https://example.com');
    const second = await invokeHandler(handler, 'https://one.com');

    expect(first.statusCode).toBe(200);
    expect(first.body.isFound).toBe(true);
    expect(first.body.rank).toBe('2');
    expect(second.statusCode).toBe(200);
    expect(second.body.rank).toBe('1');
    expect(axiosMock).not.toHaveBeenCalled();
    expect(fsMock.createReadStream).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent downloads when the csv is missing (regression for /tmp race)', async () => {
    const extractor = new EventEmitter();
    extractor.pipe = () => extractor;
    let downloadCount = 0;
    const axiosMock = jest.fn().mockImplementation(() => {
      downloadCount += 1;
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            data: {
              pipe: () => {
                setTimeout(() => extractor.emit('close'), 10);
                return extractor;
              },
            },
          });
        }, 20);
      });
    });
    const fsMock = {
      existsSync: jest.fn()
        .mockImplementationOnce(() => false)
        .mockImplementation(() => true),
      createReadStream: jest.fn(() => ({
        pipe: jest.fn(() => createCsvParser([{ rank: '5', domain: 'example.com' }])),
        on: jest.fn().mockReturnThis(),
      })),
    };
    const unzipperMock = { Extract: jest.fn().mockReturnValue(extractor) };
    const { handler, __resetLegacyRankCacheForTests } = await loadHandlerWithMocks({
      axiosMock,
      fsMock,
      unzipperMock,
      csvFactory: jest.fn().mockReturnValue(createCsvParser([{ rank: '5', domain: 'example.com' }])),
    });
    __resetLegacyRankCacheForTests();

    const [a, b] = await Promise.all([
      invokeHandler(handler, 'https://example.com'),
      invokeHandler(handler, 'https://example.com'),
    ]);

    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(downloadCount).toBe(1);
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(new Map([['legacy-rank', (_req, res) => res.status(200).json({ ok: true })]]));

    const response = await request(app).get('/api/scan/legacy-rank');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('legacy-rank')).toBe(true);
  });
});
