/**
 * Tests for `_common/circuit-breaker.js` (Task S-1).
 *
 * Validates the closed → open → half-open → closed transitions and the
 * env-flag kill switch. Time is controlled via an injected `now` so the
 * tests don't rely on real timers.
 */

import { describe, expect, it } from '@jest/globals';

import {
  CIRCUIT_BREAKER_STATES,
  createCircuitBreaker,
} from '../_common/circuit-breaker.js';

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 30_000;
const TEST_POLICY = Object.freeze({
  enabled: true,
  failureThreshold: FAILURE_THRESHOLD,
  openCooldownMs: COOLDOWN_MS,
  halfOpenMaxProbes: 1,
});

function makeClock(start = 1000) {
  const state = { t: start };
  return {
    now: () => state.t,
    advance: (ms) => {
      state.t += ms;
    },
  };
}

describe('circuit-breaker (S-1)', () => {
  it('stays closed and permits traffic while under the failure threshold', () => {
    const clock = makeClock();
    const cb = createCircuitBreaker({ now: clock.now, policy: TEST_POLICY });
    expect(cb.canRequest('https://example.com')).toEqual({
      allowed: true,
      state: CIRCUIT_BREAKER_STATES.CLOSED,
    });
    cb.recordFailure('https://example.com');
    cb.recordFailure('https://example.com');
    const snap = cb.inspect('https://example.com');
    expect(snap.state).toBe(CIRCUIT_BREAKER_STATES.CLOSED);
    expect(snap.consecutiveFailures).toBe(2);
    expect(cb.canRequest('https://example.com').allowed).toBe(true);
  });

  it('opens the breaker after consecutive failures cross the threshold', () => {
    const clock = makeClock();
    const cb = createCircuitBreaker({ now: clock.now, policy: TEST_POLICY });
    for (let i = 0; i < FAILURE_THRESHOLD; i += 1) {
      cb.recordFailure('https://example.com/api');
    }
    const decision = cb.canRequest('https://example.com/api');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('circuit_open');
    expect(decision.cooldownRemainingMs).toBe(COOLDOWN_MS);
  });

  it('transitions to half-open after the cooldown elapses', () => {
    const clock = makeClock();
    const cb = createCircuitBreaker({ now: clock.now, policy: TEST_POLICY });
    for (let i = 0; i < FAILURE_THRESHOLD; i += 1) {
      cb.recordFailure('https://degraded.example');
    }
    expect(cb.canRequest('https://degraded.example').allowed).toBe(false);
    clock.advance(COOLDOWN_MS);
    const probe = cb.canRequest('https://degraded.example');
    expect(probe.allowed).toBe(true);
    expect(probe.state).toBe(CIRCUIT_BREAKER_STATES.HALF_OPEN);
    // While the half-open probe is in flight, subsequent attempts must wait.
    const concurrent = cb.canRequest('https://degraded.example');
    expect(concurrent.allowed).toBe(false);
    expect(concurrent.reason).toBe('circuit_half_open_busy');
  });

  it('closes again when the half-open probe succeeds', () => {
    const clock = makeClock();
    const cb = createCircuitBreaker({ now: clock.now, policy: TEST_POLICY });
    for (let i = 0; i < FAILURE_THRESHOLD; i += 1) {
      cb.recordFailure('https://recover.example');
    }
    clock.advance(COOLDOWN_MS);
    expect(cb.canRequest('https://recover.example').allowed).toBe(true);
    cb.recordSuccess('https://recover.example');
    const snap = cb.inspect('https://recover.example');
    expect(snap.state).toBe(CIRCUIT_BREAKER_STATES.CLOSED);
    expect(snap.consecutiveFailures).toBe(0);
    expect(cb.canRequest('https://recover.example').allowed).toBe(true);
  });

  it('reopens with a fresh cooldown when the half-open probe fails', () => {
    const clock = makeClock();
    const cb = createCircuitBreaker({ now: clock.now, policy: TEST_POLICY });
    for (let i = 0; i < FAILURE_THRESHOLD; i += 1) {
      cb.recordFailure('https://still-bad.example');
    }
    clock.advance(COOLDOWN_MS);
    expect(cb.canRequest('https://still-bad.example').allowed).toBe(true);
    cb.recordFailure('https://still-bad.example');
    const decision = cb.canRequest('https://still-bad.example');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('circuit_open');
    // Cooldown should have restarted (a tick of 1 ms is acceptable).
    expect(decision.cooldownRemainingMs).toBeGreaterThanOrEqual(COOLDOWN_MS - 1);
  });

  it('isolates state per hostname', () => {
    const clock = makeClock();
    const cb = createCircuitBreaker({ now: clock.now, policy: TEST_POLICY });
    for (let i = 0; i < FAILURE_THRESHOLD; i += 1) {
      cb.recordFailure('https://bad.example');
    }
    expect(cb.canRequest('https://bad.example').allowed).toBe(false);
    expect(cb.canRequest('https://good.example').allowed).toBe(true);
  });

  it('honours the SCAN_CIRCUIT_BREAKER_ENABLED=false kill switch', () => {
    const clock = makeClock();
    const cb = createCircuitBreaker({
      now: clock.now,
      policy: { ...TEST_POLICY, enabled: false },
    });
    for (let i = 0; i < FAILURE_THRESHOLD * 5; i += 1) {
      cb.recordFailure('https://disabled.example');
    }
    expect(cb.canRequest('https://disabled.example').allowed).toBe(true);
  });

  it('ignores inputs without a resolvable hostname', () => {
    const clock = makeClock();
    const cb = createCircuitBreaker({ now: clock.now, policy: TEST_POLICY });
    expect(cb.canRequest('').allowed).toBe(true);
    cb.recordFailure(''); // must not throw
    expect(cb.inspect('').state).toBe(CIRCUIT_BREAKER_STATES.CLOSED);
  });
});
