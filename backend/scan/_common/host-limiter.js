// Per-host outbound concurrency limiter (Task S-7).
//
// Rationale:
//   A single scan batch can fan out 30+ modules at once. Most modules also
//   issue 1-5 sub-requests of their own. Even with the existing batch
//   `p-limit` cap (`SCAN_BATCH_CONCURRENCY`) the same hostname can see 50+
//   concurrent sockets, which is the smoking gun for CDN / WAF
//   `429` and IP-level rate limits.
//
// Contract:
//   `getHostLimiter(input).run(fn)` is the public surface. Multiple call
//   sites resolving to the same hostname share the same limiter, so the
//   *combined* in-flight count per host is capped at
//   `SCAN_HOST_CONCURRENCY` (default 6). Callers should await the run()
//   promise; the limiter does NOT enforce its own wall-clock timeout
//   because the runner / middleware already do that.
//
// Boundary:
//   Stateless w.r.t. process lifetime; per-host counters live in the
//   exported `hostLimiterRegistry` Map. Tests call `resetHostLimiters()`
//   to keep state from leaking across cases.

import pLimit from 'p-limit';

import { extractHostname } from './url.js';

const DEFAULT_HOST_CONCURRENCY = 6;

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function getHostConcurrency() {
  return envInt('SCAN_HOST_CONCURRENCY', DEFAULT_HOST_CONCURRENCY);
}

function resolveHostKey(input) {
  if (!input) return '';
  const host = extractHostname(input);
  return host ? host.toLowerCase() : '';
}

/**
 * Internal registry. Public only so the test suite can clear it between
 * cases — production callers should not interact with the Map directly.
 */
export const hostLimiterRegistry = new Map();

function makePassthroughLimiter() {
  return {
    host: '',
    activeCount: 0,
    pendingCount: 0,
    run: (fn) => Promise.resolve().then(fn),
  };
}

/**
 * Lookup (or lazily create) the limiter that gates outbound concurrency
 * for the given hostname.
 *
 * @param {string} input  URL or hostname.
 */
export function getHostLimiter(input) {
  const host = resolveHostKey(input);
  if (!host) {
    return makePassthroughLimiter();
  }
  let limiter = hostLimiterRegistry.get(host);
  if (!limiter) {
    const innerLimit = pLimit(getHostConcurrency());
    limiter = {
      host,
      get activeCount() {
        return innerLimit.activeCount;
      },
      get pendingCount() {
        return innerLimit.pendingCount;
      },
      run(fn) {
        return innerLimit(async () => fn());
      },
    };
    hostLimiterRegistry.set(host, limiter);
  }
  return limiter;
}

/**
 * Run `fn` under the per-host limiter. Convenience wrapper around
 * `getHostLimiter(input).run(fn)`.
 */
export function runUnderHostLimit(input, fn) {
  return getHostLimiter(input).run(fn);
}

/**
 * Diagnostic snapshot — useful for `/api/scan/config`.
 */
export function describeHostLimiters() {
  const hosts = {};
  for (const [host, limiter] of hostLimiterRegistry.entries()) {
    hosts[host] = {
      active: limiter.activeCount,
      pending: limiter.pendingCount,
    };
  }
  return {
    perHostConcurrency: getHostConcurrency(),
    hosts,
  };
}

/** Test-only — drop every limiter so cross-suite state cannot leak. */
export function resetHostLimiters() {
  hostLimiterRegistry.clear();
}

export const HOST_LIMITER_DEFAULTS = Object.freeze({
  DEFAULT_HOST_CONCURRENCY,
});
