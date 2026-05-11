// Shared axios instance. Modules MUST use this instead of importing axios
// directly to guarantee timeout, validate-any-status, retries, and a
// consistent User-Agent across all outbound requests.

import axios from 'axios';
import axiosRetry from 'axios-retry';

import { circuitBreaker } from './circuit-breaker.js';
import { getHttpRetryPolicy } from './config.js';

const DEFAULT_TIMEOUT_MS = parseInt(process.env.MODULE_HTTP_TIMEOUT_MS || '15000', 10);
const DEFAULT_USER_AGENT = process.env.MODULE_HTTP_USER_AGENT || 'OrbiCheck/1.0 (+https://github.com/orbicheck)';

const SHARED_HEADERS = Object.freeze({
  'User-Agent': DEFAULT_USER_AGENT,
  Accept: '*/*',
});

const SAFE_METHODS = new Set(['get', 'head', 'options']);

const RETRY_AFTER_MAX_MS = 5_000;
const SERVER_ERROR_FLOOR = 500;
const SERVER_ERROR_CEILING = 600;
const STATUS_TOO_MANY_REQUESTS = 429;
const FAST_FAIL_STATUS = 503;
const FAST_FAIL_DURATION_MS = 0;

function isRetriable5xx() {
  // S-2: by default, do NOT retry 5xx (caller is much better placed to
  // decide whether to retry vs surface). Operators can re-enable by setting
  // `SCAN_HTTP_RETRY_5XX=true`. The value is read on every request so tests
  // / live reloads pick it up without rebuilding the axios instance.
  return process.env.SCAN_HTTP_RETRY_5XX === 'true';
}

function parseRetryAfterMs(headerValue) {
  if (!headerValue) return 0;
  if (typeof headerValue === 'string') {
    const seconds = parseFloat(headerValue);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(Math.floor(seconds * 1000), RETRY_AFTER_MAX_MS);
    }
    const date = Date.parse(headerValue);
    if (!Number.isNaN(date)) {
      const delta = date - Date.now();
      if (delta > 0) return Math.min(delta, RETRY_AFTER_MAX_MS);
    }
  }
  return 0;
}

function isServerError(status) {
  return Number.isFinite(status) && status >= SERVER_ERROR_FLOOR && status < SERVER_ERROR_CEILING;
}

function applyRetry(instance) {
  const { retries, baseMs } = getHttpRetryPolicy();
  if (retries <= 0) return;
  // S-2: only retry idempotent (GET/HEAD/OPTIONS) requests, and limit the
  // retriable classes to network errors + 429. 5xx is opt-in via
  // SCAN_HTTP_RETRY_5XX=true so a target in distress isn't pounded.
  axiosRetry(instance, {
    retries,
    validateResponse: (response) => {
      if (!response) return false;
      const { status, config } = response;
      const method = (config?.method || 'get').toLowerCase();
      if (!SAFE_METHODS.has(method)) return true;
      if (status === STATUS_TOO_MANY_REQUESTS) return false;
      if (isServerError(status) && isRetriable5xx()) return false;
      return true;
    },
    retryCondition: (error) => {
      const method = (error?.config?.method || 'get').toLowerCase();
      if (!SAFE_METHODS.has(method)) return false;
      if (axiosRetry.isNetworkError(error)) return true;
      const status = error?.response?.status;
      if (status === STATUS_TOO_MANY_REQUESTS) return true;
      if (isServerError(status) && isRetriable5xx()) return true;
      return false;
    },
    retryDelay: (retryCount, error) => {
      const retryAfterMs = parseRetryAfterMs(error?.response?.headers?.['retry-after']);
      if (retryAfterMs > 0) {
        const jitter = Math.floor(Math.random() * Math.min(retryAfterMs / 2, 500));
        return retryAfterMs + jitter;
      }
      const delay = baseMs * 2 ** (retryCount - 1);
      const jitter = Math.floor(Math.random() * (delay / 2));
      return delay + jitter;
    },
    shouldResetTimeout: false,
  });

  // Final guardrail: when axios-retry exhausts the retry budget, axios
  // would otherwise reject with an AxiosError carrying the last response.
  // Modules that read this instance expect to be able to inspect
  // `response.status >= 400` instead of try/catch (`validateStatus: () =>
  // true` contract), so we unwrap the error back into the response. This
  // interceptor is registered AFTER axios-retry's so it sits at the tail
  // of the response chain.
  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error && error.response) return error.response;
      return Promise.reject(error);
    },
  );
}

function attachCircuitBreaker(instance) {
  // S-1: gate every outbound request on the per-host circuit breaker. The
  // request interceptor short-circuits an open breaker with a synthetic
  // 503 response so calling modules can branch on `status` exactly like a
  // real upstream failure. The response interceptor records success/failure
  // so the breaker learns from real traffic.
  instance.interceptors.request.use((config) => {
    const target = config?.url;
    const decision = circuitBreaker.canRequest(target || '');
    if (!decision.allowed) {
      const synthetic = new Error('circuit_breaker_open');
      synthetic.code = 'CIRCUIT_OPEN';
      synthetic.response = {
        status: FAST_FAIL_STATUS,
        statusText: 'Circuit breaker open',
        data: {
          error: 'circuit_breaker_open',
          reason: decision.reason,
          cooldownRemainingMs: decision.cooldownRemainingMs,
        },
        headers: {},
        config,
        durationMs: FAST_FAIL_DURATION_MS,
      };
      return Promise.reject(synthetic);
    }
    config.__circuitTarget = target;
    return config;
  });
  instance.interceptors.response.use(
    (response) => {
      const status = response?.status;
      const target = response?.config?.__circuitTarget;
      if (isServerError(status) || status === STATUS_TOO_MANY_REQUESTS) {
        circuitBreaker.recordFailure(target || '');
      } else {
        circuitBreaker.recordSuccess(target || '');
      }
      return response;
    },
    (error) => {
      const target = error?.config?.__circuitTarget;
      circuitBreaker.recordFailure(target || '');
      return Promise.reject(error);
    },
  );
}

export const http = axios.create({
  timeout: DEFAULT_TIMEOUT_MS,
  validateStatus: () => true,
  headers: { ...SHARED_HEADERS },
});
attachCircuitBreaker(http);
applyRetry(http);

// Allow per-call timeout overrides while still using the shared instance.
// Each call returns its own axios instance so per-module config (e.g. a
// stricter timeout for whois) doesn't leak globally.
export function httpWith(config = {}) {
  const instance = axios.create({
    timeout: DEFAULT_TIMEOUT_MS,
    validateStatus: () => true,
    headers: { ...SHARED_HEADERS },
    ...config,
  });
  attachCircuitBreaker(instance);
  applyRetry(instance);
  return instance;
}

export const HTTP_DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
