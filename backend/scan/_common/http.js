// Shared axios instance. Modules MUST use this instead of importing axios
// directly to guarantee timeout, validate-any-status, and a consistent
// User-Agent across all outbound requests.

import axios from 'axios';

const DEFAULT_TIMEOUT_MS = parseInt(process.env.MODULE_HTTP_TIMEOUT_MS || '15000', 10);
const DEFAULT_USER_AGENT = process.env.MODULE_HTTP_USER_AGENT || 'OrbiCheck/1.0 (+https://github.com/orbicheck)';

export const http = axios.create({
  timeout: DEFAULT_TIMEOUT_MS,
  validateStatus: () => true,
  headers: {
    'User-Agent': DEFAULT_USER_AGENT,
    Accept: '*/*',
  },
});

// Allow per-call timeout overrides while still using the shared instance.
export function httpWith(config = {}) {
  return axios.create({
    timeout: DEFAULT_TIMEOUT_MS,
    validateStatus: () => true,
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: '*/*',
    },
    ...config,
  });
}

export const HTTP_DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
