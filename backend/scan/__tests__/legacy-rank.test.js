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

  it('returns rank data on success and downloads the csv into os.tmpdir() when missing', async () => {
    const parser = createCsvParser([{ rank: '42', domain: 'example.com' }]);
    const extractor = new EventEmitter();
    const axiosMock = jest.fn().mockResolvedValue({
      data: {
        pipe: () => {
          process.nextTick(() => extractor.emit('close'));
          return extractor;
        },
      },
    });
    const fsMock = {
      existsSync: jest.fn().mockReturnValue(false),
      createReadStream: jest.fn().mockReturnValue({
        pipe: () => parser,
      }),
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
    expect(fsMock.createReadStream).toHaveBeenCalledWith(
      path.join(os.tmpdir(), 'orbicheck-umbrella-top-1m.csv'),
    );
  });

  it('returns a skipped payload when the domain is not found in the csv', async () => {
    const parser = createCsvParser([{ rank: '77', domain: 'other.com' }]);
    const { handler, __resetLegacyRankCacheForTests } = await loadHandlerWithMocks({
      axiosMock: jest.fn(),
      fsMock: {
        existsSync: jest.fn().mockReturnValue(true),
        createReadStream: jest.fn().mockReturnValue({
          pipe: () => parser,
        }),
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

  it('caches the parsed rank table across invocations (single download + single parse)', async () => {
    const buildParser = () => createCsvParser([
      { rank: '1', domain: 'one.com' },
      { rank: '2', domain: 'example.com' },
    ]);
    const csvFactory = jest.fn(() => buildParser());
    const axiosMock = jest.fn();
    const extractor = new EventEmitter();
    extractor.pipe = () => extractor;
    const fsMock = {
      existsSync: jest.fn().mockReturnValue(true),
      createReadStream: jest.fn().mockReturnValue({
        pipe: () => csvFactory(),
      }),
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
      existsSync: jest.fn().mockReturnValue(false),
      createReadStream: jest.fn().mockReturnValue({
        pipe: () => createCsvParser([{ rank: '5', domain: 'example.com' }]),
      }),
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
