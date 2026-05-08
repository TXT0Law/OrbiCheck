/**
 * Regression tests for TASK-P3-3 — `_common/config.js` ↔ `registry.js` wiring.
 *
 * The registry MUST honour `SCAN_MODULES_DISABLED` (kill list) and
 * `SCAN_MODULES_ENABLED` (whitelist) so operators can roll a runaway module
 * back without redeploying. These tests exercise the registry directly.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';

import { loadModules } from '../registry.js';

let savedDisabled;
let savedEnabled;

beforeAll(() => {
  savedDisabled = process.env.SCAN_MODULES_DISABLED;
  savedEnabled = process.env.SCAN_MODULES_ENABLED;
});

afterEach(() => {
  delete process.env.SCAN_MODULES_DISABLED;
  delete process.env.SCAN_MODULES_ENABLED;
});

afterAll(() => {
  if (savedDisabled !== undefined) process.env.SCAN_MODULES_DISABLED = savedDisabled;
  if (savedEnabled !== undefined) process.env.SCAN_MODULES_ENABLED = savedEnabled;
});

describe('registry.js + config.js wiring', () => {
  it('skips modules listed in SCAN_MODULES_DISABLED', async () => {
    const baseline = await loadModules();
    expect(baseline.has('headers')).toBe(true);
    expect(baseline.has('tls')).toBe(true);

    process.env.SCAN_MODULES_DISABLED = 'tls,headers';
    const filtered = await loadModules();

    expect(filtered.has('tls')).toBe(false);
    expect(filtered.has('headers')).toBe(false);
    // Other modules remain.
    expect(filtered.has('whois')).toBe(true);
    expect(filtered.size).toBe(baseline.size - 2);
  });

  it('honours SCAN_MODULES_ENABLED as an exclusive whitelist', async () => {
    process.env.SCAN_MODULES_ENABLED = 'rank,headers';
    const filtered = await loadModules();

    expect(filtered.has('rank')).toBe(true);
    expect(filtered.has('headers')).toBe(true);
    expect(filtered.size).toBe(2);
    // Even unrelated extended-modules like `whois` must be filtered out.
    expect(filtered.has('whois')).toBe(false);
  });

  it('disabled list takes precedence over whitelist', async () => {
    process.env.SCAN_MODULES_ENABLED = 'rank,tls';
    process.env.SCAN_MODULES_DISABLED = 'tls';
    const filtered = await loadModules();

    expect(filtered.has('rank')).toBe(true);
    expect(filtered.has('tls')).toBe(false);
    expect(filtered.size).toBe(1);
  });
});
