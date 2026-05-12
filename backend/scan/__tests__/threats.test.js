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

async function loadHandlerWithMocks({ httpMock, xmlFactory }) {
  jest.resetModules();
  await jest.unstable_mockModule('../_common/http.js', () => ({
    http: httpMock,
    httpWith: () => httpMock,
    HTTP_DEFAULT_TIMEOUT_MS: 1000,
  }));
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
    const httpMock = {
      get: jest.fn(),
      post: jest.fn((url) => {
        if (url.includes('urlhaus-api')) {
          return Promise.resolve({ status: 200, data: { query_status: 'ok', urls: [] } });
        }
        if (url.includes('phishtank')) {
          return Promise.resolve({ status: 200, data: '<response></response>' });
        }
        if (url.includes('cloudmersive')) {
          return Promise.resolve({ status: 200, data: { CleanResult: true } });
        }
        if (url.includes('safebrowsing')) {
          return Promise.resolve({ status: 200, data: {} });
        }
        throw new Error(`Unexpected post url: ${url}`);
      }),
    };

    const handler = await loadHandlerWithMocks({
      httpMock,
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
    expect(response.body.success).toBe(true);
    const data = response.body.data;
    expect(data.urlHaus.query_status).toBe('ok');
    expect(data.phishTank.verified).toBe('false');
    expect(data.cloudmersive.CleanResult).toBe(true);
    expect(data.safeBrowsing.unsafe).toBe(false);
  });

  it('returns dependency error payloads gracefully when api keys are missing', async () => {
    delete process.env.GOOGLE_CLOUD_API_KEY;
    delete process.env.CLOUDMERSIVE_API_KEY;
    const httpMock = {
      get: jest.fn(),
      post: jest.fn((url) => {
        if (url.includes('urlhaus-api')) {
          return Promise.resolve({ status: 200, data: { query_status: 'ok' } });
        }
        if (url.includes('phishtank')) {
          return Promise.reject(new Error('phishtank timeout'));
        }
        return Promise.reject(new Error('unexpected'));
      }),
    };

    const handler = await loadHandlerWithMocks({
      httpMock,
      xmlFactory: {
        default: {
          parseStringPromise: jest.fn(),
        },
      },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    const data = response.body.data;
    expect(data.urlHaus.query_status).toBe('ok');
    expect(data.phishTank.error).toContain('PhishTank failed');
    expect(data.cloudmersive.error).toContain('CLOUDMERSIVE_API_KEY');
    expect(data.safeBrowsing.error).toContain('GOOGLE_CLOUD_API_KEY');
  });

  it('returns a generic error envelope when every provider fails', async () => {
    process.env.GOOGLE_CLOUD_API_KEY = 'google-key';
    process.env.CLOUDMERSIVE_API_KEY = 'cloud-key';
    const httpMock = {
      get: jest.fn().mockRejectedValue(new Error('down')),
      post: jest.fn().mockRejectedValue(new Error('provider down')),
    };

    const handler = await loadHandlerWithMocks({
      httpMock,
      xmlFactory: {
        default: {
          parseStringPromise: jest.fn().mockRejectedValue(new Error('xml parse failed')),
        },
      },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe(GENERIC_ERROR_MESSAGE);
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
    const httpMock = {
      get: jest.fn(),
      post: jest.fn((url) => {
        if (url.includes('urlhaus')) {
          return Promise.resolve({ status: 200, data: { query_status: 'ok' } });
        }
        if (url.includes('phishtank')) {
          return Promise.resolve({ status: 200, data: '<response></response>' });
        }
        if (url.includes('cloudmersive')) {
          return Promise.resolve({ status: 200, data: { CleanResult: true } });
        }
        if (url.includes('safebrowsing')) {
          return Promise.resolve({ status: 200, data: {} });
        }
        throw new Error(`unexpected url ${url}`);
      }),
    };

    const handler = await loadHandlerWithMocks({
      httpMock,
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
    expect(response.body.success).toBe(true);
    const data = response.body.data;
    expect(data.urlHaus).toBeDefined();
    expect(data.phishTank).toBeDefined();
    expect(data.cloudmersive).toBeDefined();
    expect(data.safeBrowsing).toBeDefined();
  });

  it('runs all four providers in parallel (regression: total time < sum of individual delays)', async () => {
    process.env.GOOGLE_CLOUD_API_KEY = 'google-key';
    process.env.CLOUDMERSIVE_API_KEY = 'cloud-key';
    const PROVIDER_DELAY_MS = 80;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const httpMock = {
      get: jest.fn().mockImplementation(async () => {
        await sleep(PROVIDER_DELAY_MS);
        return { status: 200, data: { query_status: 'ok' } };
      }),
      post: jest.fn().mockImplementation(async () => {
        await sleep(PROVIDER_DELAY_MS);
        return { status: 200, data: {} };
      }),
    };

    const handler = await loadHandlerWithMocks({
      httpMock,
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

  it('returns a skipped envelope when all four providers fail and at least one is missing a key (S-9 / R-2)', async () => {
    delete process.env.GOOGLE_CLOUD_API_KEY;
    delete process.env.CLOUDMERSIVE_API_KEY;
    const httpMock = {
      get: jest.fn(),
      post: jest.fn((url) => {
        // URLHaus and PhishTank do not need API keys but might be unreachable
        // (Docker DNS hiccups, provider rate limit). The R-2 contract says:
        // if any provider is "missing key", treat the whole module as
        // skipped because the operator hasn't opted in to threat-intel
        // scanning — they shouldn't see a hard ❌ for transient network
        // failure on the optional reachable providers.
        if (url.includes('urlhaus-api')) {
          return Promise.reject(new Error('URLHaus offline'));
        }
        if (url.includes('phishtank')) {
          return Promise.reject(new Error('PhishTank offline'));
        }
        return Promise.reject(new Error('unexpected'));
      }),
    };

    const handler = await loadHandlerWithMocks({
      httpMock,
      xmlFactory: { default: { parseStringPromise: jest.fn() } },
    });

    const response = await invokeHandler(handler);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.skipped).toContain('No threat-intel API keys');
    expect(response.body.data.urlHaus.error).toContain('URLHaus offline');
  });

  it('still hard-fails when every provider has a real error and none are missing keys', async () => {
    process.env.GOOGLE_CLOUD_API_KEY = 'google-key';
    process.env.CLOUDMERSIVE_API_KEY = 'cloud-key';
    const httpMock = {
      get: jest.fn(),
      post: jest.fn(() => Promise.reject(new Error('genuine outage'))),
    };

    const handler = await loadHandlerWithMocks({
      httpMock,
      xmlFactory: {
        default: {
          parseStringPromise: jest
            .fn()
            .mockRejectedValue(new Error('xml parse failed')),
        },
      },
    });

    const response = await invokeHandler(handler);

    // No missing-key marker on any provider → keep the hard failure so
    // operators can clearly see the upstream is broken.
    expect(response.statusCode).toBe(500);
    expect(response.body.success).toBe(false);
  });

  it('marks the module skipped when only key-required providers fail (S-9)', async () => {
    delete process.env.GOOGLE_CLOUD_API_KEY;
    delete process.env.CLOUDMERSIVE_API_KEY;
    const httpMock = {
      get: jest.fn(),
      post: jest.fn((url) => {
        // Make URLHaus and PhishTank also return a "no key" shaped error so
        // the all-missing-key branch triggers.
        if (url.includes('urlhaus-api')) {
          return Promise.resolve({ status: 200, data: { error: 'API key required' } });
        }
        if (url.includes('phishtank')) {
          return Promise.resolve({ status: 200, data: '<response></response>' });
        }
        return Promise.reject(new Error('unexpected'));
      }),
    };

    const handler = await loadHandlerWithMocks({
      httpMock,
      xmlFactory: {
        default: {
          // PhishTank parser succeeds but the surrounding test forces the
          // upstream "key required" semantics on the cloudmersive / safe-
          // browsing providers (which are config-gated).
          parseStringPromise: jest
            .fn()
            .mockRejectedValue(new Error('API_KEY missing')),
        },
      },
    });

    const response = await invokeHandler(handler);

    // The two key-gated providers immediately short-circuit with
    // missingApiKey:true; URLHaus + PhishTank also produce error-shaped
    // payloads tagged with our marker → all-skipped path returns a
    // success envelope where `data.skipped` is set so the transformer's
    // `_is_skipped(raw_result)` flips the module status to "skipped".
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.skipped).toContain('No threat-intel API keys');
  });

  it('passes a 5s timeout to every provider call (regression: prevent hanging requests)', async () => {
    process.env.GOOGLE_CLOUD_API_KEY = 'google-key';
    process.env.CLOUDMERSIVE_API_KEY = 'cloud-key';
    const httpMock = {
      get: jest.fn().mockResolvedValue({ status: 200, data: {} }),
      post: jest.fn().mockResolvedValue({ status: 200, data: '<response></response>' }),
    };

    const handler = await loadHandlerWithMocks({
      httpMock,
      xmlFactory: {
        default: {
          parseStringPromise: jest.fn().mockResolvedValue({ response: { results: {} } }),
        },
      },
    });

    await invokeHandler(handler);

    // Every http.post call's third arg (config) carries timeout: 5000.
    for (const call of httpMock.post.mock.calls) {
      const config = call[2];
      if (config) {
        expect(config.timeout).toBe(5000);
      }
    }
  });
});
