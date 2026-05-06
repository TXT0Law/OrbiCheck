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

async function loadHandlerWithMocks({ axiosFactory, xmlFactory }) {
  jest.resetModules();
  await jest.unstable_mockModule('axios', () => axiosFactory);
  await jest.unstable_mockModule('xml2js', () => xmlFactory);
  const { handler } = await import('../threats.js');
  return handler;
}

async function invokeHandler(handler, url = 'https://example.com') {
  const req = { query: { url } };
  const res = createResponseCapture();
  await handler(req, res);
  return res;
}

describe('threats module', () => {
  const originalGoogleKey = process.env.GOOGLE_CLOUD_API_KEY;
  const originalCloudmersiveKey = process.env.CLOUDMERSIVE_API_KEY;

  afterEach(() => {
    process.env.GOOGLE_CLOUD_API_KEY = originalGoogleKey;
    process.env.CLOUDMERSIVE_API_KEY = originalCloudmersiveKey;
    setModulesForTest(new Map());
  });

  it('returns threat intelligence data on success', async () => {
    process.env.GOOGLE_CLOUD_API_KEY = 'google-key';
    process.env.CLOUDMERSIVE_API_KEY = 'cloud-key';
    const axiosMock = jest.fn((configOrUrl) => {
      if (typeof configOrUrl === 'object' && configOrUrl.url.includes('urlhaus-api')) {
        return Promise.resolve({ data: { query_status: 'ok', urls: [] } });
      }
      throw new Error('Unexpected axios config call');
    });
    axiosMock.post = jest.fn((url) => {
      if (url.includes('phishtank')) {
        return Promise.resolve({ data: '<response></response>' });
      }
      if (url.includes('cloudmersive')) {
        return Promise.resolve({ data: { CleanResult: true } });
      }
      if (url.includes('safebrowsing')) {
        return Promise.resolve({ data: {} });
      }
      throw new Error(`Unexpected post url: ${url}`);
    });

    const handler = await loadHandlerWithMocks({
      axiosFactory: { default: axiosMock },
      xmlFactory: {
        default: {
          parseStringPromise: jest.fn().mockResolvedValue({
            response: { results: { verified: 'false' } },
          }),
        },
      },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.urlHaus.query_status).toBe('ok');
    expect(response.body.phishTank.verified).toBe('false');
    expect(response.body.cloudmersive.CleanResult).toBe(true);
    expect(response.body.safeBrowsing.unsafe).toBe(false);
  });

  it('returns dependency error payloads gracefully when api keys are missing', async () => {
    delete process.env.GOOGLE_CLOUD_API_KEY;
    delete process.env.CLOUDMERSIVE_API_KEY;
    const axiosMock = jest.fn().mockResolvedValue({ data: { query_status: 'ok' } });
    axiosMock.post = jest.fn().mockRejectedValue(new Error('phishtank timeout'));

    const handler = await loadHandlerWithMocks({
      axiosFactory: { default: axiosMock },
      xmlFactory: {
        default: {
          parseStringPromise: jest.fn(),
        },
      },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.urlHaus.query_status).toBe('ok');
    expect(response.body.phishTank.error).toContain('PhishTank failed');
    expect(response.body.cloudmersive.error).toContain('CLOUDMERSIVE_API_KEY');
    expect(response.body.safeBrowsing.error).toContain('GOOGLE_CLOUD_API_KEY');
  });

  it('returns a generic error when every provider fails', async () => {
    process.env.GOOGLE_CLOUD_API_KEY = 'google-key';
    process.env.CLOUDMERSIVE_API_KEY = 'cloud-key';
    const axiosMock = jest.fn().mockRejectedValue(new Error('urlhaus down'));
    axiosMock.post = jest.fn().mockRejectedValue(new Error('provider down'));

    const handler = await loadHandlerWithMocks({
      axiosFactory: { default: axiosMock },
      xmlFactory: {
        default: {
          parseStringPromise: jest.fn().mockRejectedValue(new Error('xml parse failed')),
        },
      },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: GENERIC_ERROR_MESSAGE });
  });

  it('returns 400 when url query parameter is missing', async () => {
    setModulesForTest(new Map([['threats', (_req, res) => res.status(200).json({ ok: true })]]));

    const response = await request(app).get('/api/scan/threats');

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('Missing required query parameter: url');
  });

  it('is registered in module registry', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('threats')).toBe(true);
  });

  it('does not double-encode the result body (regression: must return an object, not a JSON string)', async () => {
    process.env.GOOGLE_CLOUD_API_KEY = 'google-key';
    process.env.CLOUDMERSIVE_API_KEY = 'cloud-key';
    const axiosMock = jest.fn().mockResolvedValue({ data: { query_status: 'ok' } });
    axiosMock.post = jest.fn().mockImplementation((url) => {
      if (url.includes('phishtank')) {
        return Promise.resolve({ data: '<response></response>' });
      }
      if (url.includes('cloudmersive')) {
        return Promise.resolve({ data: { CleanResult: true } });
      }
      if (url.includes('safebrowsing')) {
        return Promise.resolve({ data: {} });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const handler = await loadHandlerWithMocks({
      axiosFactory: { default: axiosMock },
      xmlFactory: {
        default: {
          parseStringPromise: jest.fn().mockResolvedValue({
            response: { results: { verified: 'false' } },
          }),
        },
      },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(typeof response.body).toBe('object');
    expect(response.body).not.toBeInstanceOf(String);
    expect(response.body.urlHaus).toBeDefined();
    expect(response.body.phishTank).toBeDefined();
    expect(response.body.cloudmersive).toBeDefined();
    expect(response.body.safeBrowsing).toBeDefined();
  });

  it('runs all four providers in parallel (regression: total time < sum of individual delays)', async () => {
    process.env.GOOGLE_CLOUD_API_KEY = 'google-key';
    process.env.CLOUDMERSIVE_API_KEY = 'cloud-key';
    const PROVIDER_DELAY_MS = 80;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const axiosMock = jest.fn().mockImplementation(async () => {
      await sleep(PROVIDER_DELAY_MS);
      return { data: { query_status: 'ok' } };
    });
    axiosMock.post = jest.fn().mockImplementation(async () => {
      await sleep(PROVIDER_DELAY_MS);
      return { data: {} };
    });

    const handler = await loadHandlerWithMocks({
      axiosFactory: { default: axiosMock },
      xmlFactory: {
        default: {
          parseStringPromise: jest.fn().mockResolvedValue({
            response: { results: { verified: 'false' } },
          }),
        },
      },
    });

    const startedAt = Date.now();
    const response = await invokeHandler(handler);
    const elapsed = Date.now() - startedAt;

    expect(response.statusCode).toBe(200);
    // Four serial 80 ms providers would take >= 320 ms; parallel execution
    // should comfortably stay below 240 ms. Using a generous bound to keep
    // the test stable on noisy CI.
    expect(elapsed).toBeLessThan(PROVIDER_DELAY_MS * 3);
  });

  it('passes a 5s timeout to every axios provider call (regression: prevent hanging requests)', async () => {
    process.env.GOOGLE_CLOUD_API_KEY = 'google-key';
    process.env.CLOUDMERSIVE_API_KEY = 'cloud-key';
    const axiosMock = jest.fn().mockResolvedValue({ data: {} });
    axiosMock.post = jest.fn().mockResolvedValue({ data: '<response></response>' });

    const handler = await loadHandlerWithMocks({
      axiosFactory: { default: axiosMock },
      xmlFactory: {
        default: {
          parseStringPromise: jest.fn().mockResolvedValue({ response: { results: {} } }),
        },
      },
    });

    await invokeHandler(handler);

    const allCalls = [
      ...axiosMock.mock.calls.map((args) => args[0]),
      ...axiosMock.post.mock.calls.map((args) => args[2]),
    ];
    for (const call of allCalls) {
      if (call && typeof call === 'object') {
        expect(call.timeout).toBe(5000);
      }
    }
  });
});
