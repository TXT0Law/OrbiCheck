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
});
