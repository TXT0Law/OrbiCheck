import { EventEmitter } from 'events';
import { jest } from '@jest/globals';
import request from 'supertest';

import { app, setModulesForTest } from '../server.js';

const GENERIC_ERROR_MESSAGE = 'Request failed while processing this scan module.';

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
  const { handler } = await import('../legacy-rank.js');
  return handler;
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

  it('returns rank data on success and downloads the csv when missing from cache', async () => {
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
    const handler = await loadHandlerWithMocks({
      axiosMock,
      fsMock,
      unzipperMock,
      csvFactory: jest.fn().mockReturnValue(parser),
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      domain: 'example.com',
      rank: '42',
      isFound: true,
    });
    expect(axiosMock).toHaveBeenCalled();
    expect(unzipperMock.Extract).toHaveBeenCalledWith({ path: '/tmp' });
  });

  it('returns a skipped payload when the domain is not found in the csv', async () => {
    const parser = createCsvParser([{ rank: '77', domain: 'other.com' }]);
    const handler = await loadHandlerWithMocks({
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

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.isFound).toBe(false);
    expect(response.body.skipped).toContain('not present in the Umbrella top 1M list');
  });

  it('returns a generic error when csv parsing fails', async () => {
    const parser = createCsvParser([], new Error('csv failed'));
    const handler = await loadHandlerWithMocks({
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

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: GENERIC_ERROR_MESSAGE });
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
