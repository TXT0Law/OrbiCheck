/**
 * Direct unit tests for `_common/config.js` (TASK-P3-3).
 *
 * The config layer is the single source of truth for module timeouts,
 * disable lists, and concurrency. Future refactors must preserve these
 * env-precedence rules so operators can keep relying on the documented
 * env vars in production.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import {
  describeConfig,
  getBatchConcurrency,
  getDisabledModules,
  getEnabledModules,
  getHttpRetryPolicy,
  getModuleTimeoutMs,
  isModuleEnabled,
  SCAN_CONFIG_DEFAULTS,
} from '../_common/config.js';

const ENV_KEYS = [
  'MODULE_TIMEOUT_MS',
  'EXTENDED_MODULE_TIMEOUT_MS',
  'SCAN_BATCH_CONCURRENCY',
  'SCAN_HTTP_RETRY_COUNT',
  'SCAN_HTTP_RETRY_BASE_MS',
  'SCAN_MODULES_DISABLED',
  'SCAN_MODULES_ENABLED',
  'MODULE_TIMEOUT_TLS_MS',
  'MODULE_TIMEOUT_TECH_STACK_MS',
  'MODULE_TIMEOUT_RANK_MS',
];

let savedEnv;

beforeEach(() => {
  savedEnv = {};
  ENV_KEYS.forEach((key) => {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  });
});

afterEach(() => {
  ENV_KEYS.forEach((key) => {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  });
});

describe('config.js — getModuleTimeoutMs()', () => {
  it('returns the default for an arbitrary module', () => {
    expect(getModuleTimeoutMs('headers')).toBe(SCAN_CONFIG_DEFAULTS.DEFAULT_MODULE_TIMEOUT_MS);
  });

  it('returns the extended timeout for known slow modules', () => {
    expect(getModuleTimeoutMs('whois')).toBe(SCAN_CONFIG_DEFAULTS.DEFAULT_EXTENDED_TIMEOUT_MS);
    expect(getModuleTimeoutMs('tls')).toBe(SCAN_CONFIG_DEFAULTS.DEFAULT_EXTENDED_TIMEOUT_MS);
  });

  it('honours per-module env override (kebab → SNAKE)', () => {
    process.env.MODULE_TIMEOUT_TECH_STACK_MS = '90000';
    expect(getModuleTimeoutMs('tech-stack')).toBe(90000);
  });

  it('per-module override beats extended-modules default', () => {
    process.env.MODULE_TIMEOUT_TLS_MS = '5000';
    expect(getModuleTimeoutMs('tls')).toBe(5000);
  });

  it('ignores invalid env override and falls back to default', () => {
    process.env.MODULE_TIMEOUT_RANK_MS = 'not-a-number';
    expect(getModuleTimeoutMs('rank')).toBe(SCAN_CONFIG_DEFAULTS.DEFAULT_MODULE_TIMEOUT_MS);
  });
});

describe('config.js — module enable / disable', () => {
  it('reports all modules as enabled by default', () => {
    expect(getDisabledModules()).toEqual([]);
    expect(getEnabledModules()).toEqual([]);
    expect(isModuleEnabled('whois')).toBe(true);
  });

  it('parses SCAN_MODULES_DISABLED into a kill list', () => {
    process.env.SCAN_MODULES_DISABLED = 'tls, ports , whois';
    expect(getDisabledModules()).toEqual(['tls', 'ports', 'whois']);
    expect(isModuleEnabled('tls')).toBe(false);
    expect(isModuleEnabled('headers')).toBe(true);
  });

  it('SCAN_MODULES_ENABLED acts as an exclusive whitelist', () => {
    process.env.SCAN_MODULES_ENABLED = 'rank,tls';
    expect(isModuleEnabled('rank')).toBe(true);
    expect(isModuleEnabled('tls')).toBe(true);
    // Anything not in the whitelist is disabled.
    expect(isModuleEnabled('headers')).toBe(false);
  });

  it('disabled list takes precedence over whitelist', () => {
    process.env.SCAN_MODULES_ENABLED = 'rank,tls';
    process.env.SCAN_MODULES_DISABLED = 'tls';
    expect(isModuleEnabled('rank')).toBe(true);
    expect(isModuleEnabled('tls')).toBe(false);
  });
});

describe('config.js — batch concurrency / retry', () => {
  it('defaults batch concurrency to 10', () => {
    expect(getBatchConcurrency()).toBe(SCAN_CONFIG_DEFAULTS.DEFAULT_BATCH_CONCURRENCY);
  });

  it('honours SCAN_BATCH_CONCURRENCY env override', () => {
    process.env.SCAN_BATCH_CONCURRENCY = '4';
    expect(getBatchConcurrency()).toBe(4);
  });

  it('rejects non-positive concurrency env values', () => {
    process.env.SCAN_BATCH_CONCURRENCY = '-1';
    expect(getBatchConcurrency()).toBe(SCAN_CONFIG_DEFAULTS.DEFAULT_BATCH_CONCURRENCY);
    process.env.SCAN_BATCH_CONCURRENCY = '0';
    expect(getBatchConcurrency()).toBe(SCAN_CONFIG_DEFAULTS.DEFAULT_BATCH_CONCURRENCY);
  });

  it('exposes a retry policy with sane defaults', () => {
    const policy = getHttpRetryPolicy();
    expect(policy.retries).toBeGreaterThanOrEqual(0);
    expect(policy.baseMs).toBeGreaterThan(0);
  });

  it('SCAN_HTTP_RETRY_COUNT=0 disables retries (zero is valid)', () => {
    process.env.SCAN_HTTP_RETRY_COUNT = '0';
    expect(getHttpRetryPolicy().retries).toBe(0);
  });
});

describe('config.js — describeConfig()', () => {
  it('returns a JSON-friendly snapshot with all config fields', () => {
    process.env.SCAN_MODULES_DISABLED = 'tls';
    const snapshot = describeConfig();
    expect(snapshot).toEqual(expect.objectContaining({
      moduleTimeoutMs: expect.any(Number),
      extendedTimeoutMs: expect.any(Number),
      extendedModules: expect.any(Array),
      disabledModules: ['tls'],
      enabledModules: [],
      batchConcurrency: expect.any(Number),
      httpRetry: expect.objectContaining({
        retries: expect.any(Number),
        baseMs: expect.any(Number),
      }),
    }));
    expect(snapshot.extendedModules).toContain('whois');
  });
});
