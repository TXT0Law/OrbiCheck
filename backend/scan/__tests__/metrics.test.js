/**
 * Direct unit tests for `_common/metrics.js` (TASK-P3-2).
 *
 * The metrics layer must:
 *   - increment `scan_module_runs_total` with the right success / timed_out
 *     labels regardless of whether the module returned ok / err / timed-out.
 *   - observe `scan_module_duration_ms` with the reported envelope duration.
 *   - track in-flight gauges so operators can spot stuck modules.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import {
  _resetMetricsForTest,
  metricsRegistry,
  observeModuleRun,
  recordBatchRun,
} from '../_common/metrics.js';

beforeEach(() => {
  _resetMetricsForTest();
});

afterEach(() => {
  _resetMetricsForTest();
});

async function snapshot() {
  return metricsRegistry.metrics();
}

describe('metrics.js — observeModuleRun()', () => {
  it('increments runs_total and records duration on success', async () => {
    const complete = observeModuleRun('demo');
    complete({ success: true, durationMs: 123 });

    const text = await snapshot();
    expect(text).toMatch(/scan_module_runs_total\{module="demo",success="true",timed_out="false"\}\s+1/);
    expect(text).toMatch(/scan_module_duration_ms_count\{module="demo",success="true"\}\s+1/);
    expect(text).toMatch(/scan_module_duration_ms_sum\{module="demo",success="true"\}\s+123/);
  });

  it('labels success="false" / timed_out="true" for runner-timed-out envelopes', async () => {
    const complete = observeModuleRun('slow');
    complete({ success: false, durationMs: 30000, timedOut: true });

    const text = await snapshot();
    expect(text).toMatch(/scan_module_runs_total\{module="slow",success="false",timed_out="true"\}\s+1/);
  });

  it('decrements active gauge when complete() is invoked', async () => {
    const complete = observeModuleRun('inflight');
    let text = await snapshot();
    expect(text).toMatch(/scan_module_active\{module="inflight"\}\s+1/);

    complete({ success: true, durationMs: 10 });
    text = await snapshot();
    expect(text).toMatch(/scan_module_active\{module="inflight"\}\s+0/);
  });

  it('accumulates multiple runs of the same module', async () => {
    observeModuleRun('repeat')({ success: true, durationMs: 5 });
    observeModuleRun('repeat')({ success: true, durationMs: 10 });
    observeModuleRun('repeat')({ success: false, durationMs: 7 });

    const text = await snapshot();
    expect(text).toMatch(/scan_module_runs_total\{module="repeat",success="true",timed_out="false"\}\s+2/);
    expect(text).toMatch(/scan_module_runs_total\{module="repeat",success="false",timed_out="false"\}\s+1/);
  });
});

describe('metrics.js — recordBatchRun()', () => {
  it('counts batches and observes batch size for clean runs', async () => {
    recordBatchRun({ totalModules: 5, failedCount: 0 });

    const text = await snapshot();
    expect(text).toMatch(/scan_batch_runs_total\{has_failures="false"\}\s+1/);
    expect(text).toMatch(/scan_batch_size_sum\{has_failures="false"\}\s+5/);
  });

  it('marks has_failures=true when failedCount > 0', async () => {
    recordBatchRun({ totalModules: 8, failedCount: 2 });

    const text = await snapshot();
    expect(text).toMatch(/scan_batch_runs_total\{has_failures="true"\}\s+1/);
  });
});
