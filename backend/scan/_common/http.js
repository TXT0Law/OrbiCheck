// Shared axios instance. Modules MUST use this instead of importing axios
// directly to guarantee timeout, validate-any-status, retries, and a
// consistent User-Agent across all outbound requests.

import axios from 'axios';
import axiosRetry from 'axios-retry';

import { getHttpRetryPolicy } from './config.js';

const DEFAULT_TIMEOUT_MS = parseInt(process.env.MODULE_HTTP_TIMEOUT_MS || '15000', 10);
const DEFAULT_USER_AGENT = process.env.MODULE_HTTP_USER_AGENT || 'OrbiCheck/1.0 (+https://github.com/orbicheck)';

const SHARED_HEADERS = Object.freeze({
  'User-Agent': DEFAULT_USER_AGENT,
  Accept: '*/*',
});

const SAFE_METHODS = new Set(['get', 'head', 'options']);

function applyRetry(instance) {
  const { retries, baseMs } = getHttpRetryPolicy();
  if (retries <= 0) return;
  // P3-5: idempotent retry-with-backoff for transient upstream failures.
  //
  // We deliberately use axios-retry's `validateResponse` callback rather
  // than its `retryCondition` because our shared instance sets
  // `validateStatus: () => true` (so modules can branch on HTTP status
  // without try/catch). Without `validateResponse`, axios resolves 5xx as a
  // success and the retry interceptor never fires.
  //
  // Retry scope is intentionally narrow: only safe methods (GET / HEAD /
  // OPTIONS), only on 5xx, 429, and network errors. POST is left alone
  // because some scan-service modules treat POST as side-effecting
  // (e.g. `threats.js` Cloudmersive submission).
  axiosRetry(instance, {
    retries,
    validateResponse: (response) => {
      if (!response) return false;
      // Treat anything < 500 (and not 429) as "success" from the retry
      // layer's perspective. Module call-sites still inspect status >= 400
      // to decide their own error envelope.
      const { status, config } = response;
      const method = (config?.method || 'get').toLowerCase();
      if (!SAFE_METHODS.has(method)) return true; // never retry non-safe methods
      if (status >= 500 && status < 600) return false;
      if (status === 429) return false;
      return true;
    },
    retryCondition: (error) => {
      if (axiosRetry.isNetworkError(error)) return true;
      const status = error?.response?.status;
      if (status >= 500 && status < 600) return true;
      if (status === 429) return true;
      return false;
    },
    retryDelay: (retryCount) => {
      // exponential backoff: base * 2^(n-1), with up to 50% jitter.
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

export const http = axios.create({
  timeout: DEFAULT_TIMEOUT_MS,
  validateStatus: () => true,
  headers: { ...SHARED_HEADERS },
});
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
  applyRetry(instance);
  return instance;
}

export const HTTP_DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
