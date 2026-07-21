// Site-level circuit breaker for outbound HTTP. Closes the gate on a
// hostname when consecutive 5xx / timeouts exceed `failureThreshold`, then
// fails fast for `openCooldownMs` so subsequent modules in the same batch
// don't keep paying their `MODULE_TIMEOUT_MS` budget against a target that
// is already known-bad.
//
// Lifecycle (Hystrix-style, simplified):
//   closed   — counting consecutive failures; resets on first success.
//   open     — rejects every probe with a 503 envelope; flips to half-open
//              after `openCooldownMs` elapses.
//   half-open— allow exactly one probe through. Success → closed; failure →
//              back to open with the cooldown restarted.
//
// Boundary:
//   This module owns its own in-memory `Map`. Keys are hostnames (lowercase
//   from `_common/url.js#extractHostname`). The breaker is per-process —
//   acceptable because scan-service is usually deployed single-instance and
//   the cooldown is short (30 s). These constraints favor an in-process
//   breaker over Redis-backed coordination for now.

import { extractHostname } from './url.js';

const STATE_CLOSED = 'closed';
const STATE_OPEN = 'open';
const STATE_HALF_OPEN = 'half_open';

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_OPEN_COOLDOWN_MS = 30_000;
const DEFAULT_HALF_OPEN_MAX_PROBES = 1;

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function readPolicy() {
  return {
    enabled: process.env.SCAN_CIRCUIT_BREAKER_ENABLED !== 'false',
    failureThreshold: envInt('SCAN_CIRCUIT_BREAKER_FAILURE_THRESHOLD', DEFAULT_FAILURE_THRESHOLD),
    openCooldownMs: envInt('SCAN_CIRCUIT_BREAKER_COOLDOWN_MS', DEFAULT_OPEN_COOLDOWN_MS),
    halfOpenMaxProbes: envInt(
      'SCAN_CIRCUIT_BREAKER_HALF_OPEN_PROBES',
      DEFAULT_HALF_OPEN_MAX_PROBES,
    ),
  };
}

/**
 * Build a fresh breaker instance. Production code should use the
 * module-level singleton (`circuitBreaker`); tests construct their own
 * instances to avoid leaking state across cases.
 *
 * @param {{ now?: () => number, policy?: ReturnType<typeof readPolicy> }} options
 */
export function createCircuitBreaker(options = {}) {
  const now = options.now || (() => Date.now());
  // Re-resolve policy on construction; tests that mutate env can call
  // `createCircuitBreaker()` after the change to pick it up.
  const policy = options.policy || readPolicy();
  /** @type {Map<string, { state: string, consecutiveFailures: number, openedAt: number, halfOpenInFlight: number }>} */
  const hostState = new Map();

  function defaultEntry() {
    return {
      state: STATE_CLOSED,
      consecutiveFailures: 0,
      openedAt: 0,
      halfOpenInFlight: 0,
    };
  }

  function resolveKey(input) {
    if (!input) return '';
    const host = extractHostname(input);
    return host ? host.toLowerCase() : '';
  }

  function transitionToHalfOpenIfDue(entry) {
    if (entry.state !== STATE_OPEN) return;
    if (now() - entry.openedAt >= policy.openCooldownMs) {
      entry.state = STATE_HALF_OPEN;
      entry.halfOpenInFlight = 0;
    }
  }

  return {
    /**
     * Snapshot a hostname's state (read-only).
     * @param {string} input Hostname or URL.
     */
    inspect(input) {
      const key = resolveKey(input);
      const entry = hostState.get(key);
      if (!entry) return { state: STATE_CLOSED, consecutiveFailures: 0, openedAt: 0 };
      transitionToHalfOpenIfDue(entry);
      return {
        state: entry.state,
        consecutiveFailures: entry.consecutiveFailures,
        openedAt: entry.openedAt,
      };
    },

    /**
     * Should the caller open a new outbound request to this hostname?
     * Returns `{ allowed: true }` when the gate is open (closed / half-open
     * with budget). Returns `{ allowed: false, reason }` when traffic must
     * fail-fast.
     *
     * @param {string} input Hostname or URL.
     */
    canRequest(input) {
      if (!policy.enabled) return { allowed: true };
      const key = resolveKey(input);
      if (!key) return { allowed: true };
      const entry = hostState.get(key) || defaultEntry();
      transitionToHalfOpenIfDue(entry);
      if (entry.state === STATE_OPEN) {
        const cooldownRemainingMs = Math.max(
          0,
          policy.openCooldownMs - (now() - entry.openedAt),
        );
        return {
          allowed: false,
          state: entry.state,
          reason: 'circuit_open',
          cooldownRemainingMs,
        };
      }
      if (entry.state === STATE_HALF_OPEN) {
        if (entry.halfOpenInFlight >= policy.halfOpenMaxProbes) {
          // Concurrent half-open probes are limited so the upstream isn't
          // hammered while we're still evaluating recovery.
          return {
            allowed: false,
            state: entry.state,
            reason: 'circuit_half_open_busy',
            cooldownRemainingMs: 0,
          };
        }
        entry.halfOpenInFlight += 1;
        hostState.set(key, entry);
      }
      hostState.set(key, entry);
      return { allowed: true, state: entry.state };
    },

    /**
     * Record a successful outbound (any 2xx/3xx/4xx that isn't 429). Resets
     * the consecutive-failure counter and closes the breaker.
     *
     * @param {string} input Hostname or URL.
     */
    recordSuccess(input) {
      if (!policy.enabled) return;
      const key = resolveKey(input);
      if (!key) return;
      const entry = hostState.get(key);
      if (!entry) return;
      entry.consecutiveFailures = 0;
      entry.state = STATE_CLOSED;
      entry.openedAt = 0;
      entry.halfOpenInFlight = 0;
      hostState.set(key, entry);
    },

    /**
     * Record an outbound failure (5xx, 429, network error, or timeout).
     * Opens the breaker once `failureThreshold` is reached.
     *
     * @param {string} input Hostname or URL.
     */
    recordFailure(input) {
      if (!policy.enabled) return;
      const key = resolveKey(input);
      if (!key) return;
      const entry = hostState.get(key) || defaultEntry();
      // If we are in half-open and the probe failed, flip straight back to
      // open with the cooldown restarted.
      if (entry.state === STATE_HALF_OPEN) {
        entry.state = STATE_OPEN;
        entry.openedAt = now();
        entry.halfOpenInFlight = 0;
        hostState.set(key, entry);
        return;
      }
      entry.consecutiveFailures += 1;
      if (entry.consecutiveFailures >= policy.failureThreshold) {
        entry.state = STATE_OPEN;
        entry.openedAt = now();
      }
      hostState.set(key, entry);
    },

    /**
     * Test seam — wipe all per-host state. Production callers should NOT
     * use this; restart the process instead.
     */
    reset() {
      hostState.clear();
    },

    /**
     * Diagnostic snapshot for `/api/scan/config` etc.
     */
    describe() {
      const hosts = {};
      for (const [host, entry] of hostState.entries()) {
        hosts[host] = {
          state: entry.state,
          consecutiveFailures: entry.consecutiveFailures,
          openedAt: entry.openedAt,
        };
      }
      return { policy, hosts };
    },
  };
}

export const CIRCUIT_BREAKER_STATES = Object.freeze({
  CLOSED: STATE_CLOSED,
  OPEN: STATE_OPEN,
  HALF_OPEN: STATE_HALF_OPEN,
});

/** Process-wide singleton consumed by `_common/http.js`. */
export const circuitBreaker = createCircuitBreaker();

export function getCircuitBreakerPolicy() {
  return readPolicy();
}
