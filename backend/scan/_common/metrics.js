// Prometheus metrics for the scan service (TASK-P3-2).
//
// Exposes a single shared `prom-client` Registry with the metrics that
// matter for OSINT operators:
//
//   * `scan_module_runs_total{module, success, timed_out}` ── counter
//   * `scan_module_duration_ms{module}`                   ── histogram
//   * `scan_module_active`                                ── gauge
//   * `scan_batch_runs_total`                             ── counter
//   * `scan_batch_size`                                   ── histogram
//
// Plus the standard Node.js process metrics (event loop lag, GC, RSS) via
// `collectDefaultMetrics`.
//
// Design notes:
//   - Histograms use ms-scale buckets aligned with module-level timeouts so
//     `module_duration_ms_bucket{le="30000"}` directly answers "how many
//     modules hit the default timeout?".
//   - Labels intentionally avoid high-cardinality fields (no URL / no
//     scanId) to keep the Prometheus index small.
//   - `prom-client` is required, but everything is wrapped behind helper
//     functions so call-sites don't import the library directly. That keeps
//     the dependency easy to swap (e.g. for OpenTelemetry) later.

import client from 'prom-client';

const registry = new client.Registry();

// Standard process metrics (heap, gc, event-loop lag) cost ~30 bytes / scrape.
client.collectDefaultMetrics({ register: registry, prefix: 'scan_' });

const moduleRunsTotal = new client.Counter({
  name: 'scan_module_runs_total',
  help: 'Total scan-module executions, labelled by success and timeout.',
  labelNames: ['module', 'success', 'timed_out'],
  registers: [registry],
});

const moduleDurationMs = new client.Histogram({
  name: 'scan_module_duration_ms',
  help: 'Wall-clock duration of scan-module executions, in milliseconds.',
  labelNames: ['module', 'success'],
  // Aligned with default 30s + extended 60s module timeouts so SLO queries
  // can report `histogram_quantile(0.95, ...)`-style p95 latencies.
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 20000, 30000, 60000],
  registers: [registry],
});

const moduleActive = new client.Gauge({
  name: 'scan_module_active',
  help: 'Currently in-flight scan-module executions.',
  labelNames: ['module'],
  registers: [registry],
});

const batchRunsTotal = new client.Counter({
  name: 'scan_batch_runs_total',
  help: 'Total batch scan requests served by /api/scan/batch.',
  labelNames: ['has_failures'],
  registers: [registry],
});

const batchSize = new client.Histogram({
  name: 'scan_batch_size',
  help: 'Number of modules requested per batch.',
  labelNames: ['has_failures'],
  buckets: [1, 2, 4, 8, 16, 24, 32, 48],
  registers: [registry],
});

/**
 * Begin observing a module run; returns a `complete()` callback to call
 * when the run finishes (success or failure). Splitting into begin/end
 * lets the gauge track in-flight work even when the module throws.
 *
 * @param {string} moduleName
 * @returns {(envelope: {success: boolean, durationMs: number, timedOut?: boolean}) => void}
 */
export function observeModuleRun(moduleName) {
  moduleActive.labels(moduleName).inc();
  return (envelope) => {
    moduleActive.labels(moduleName).dec();
    const success = envelope && envelope.success ? 'true' : 'false';
    const timedOut = envelope && envelope.timedOut ? 'true' : 'false';
    moduleRunsTotal.labels(moduleName, success, timedOut).inc();
    const durationMs = envelope && Number.isFinite(envelope.durationMs) ? envelope.durationMs : 0;
    moduleDurationMs.labels(moduleName, success).observe(durationMs);
  };
}

/**
 * Record a batch run summary after all modules have finished.
 *
 * @param {{ totalModules: number, failedCount: number }} summary
 */
export function recordBatchRun({ totalModules, failedCount }) {
  const hasFailures = failedCount > 0 ? 'true' : 'false';
  batchRunsTotal.labels(hasFailures).inc();
  batchSize.labels(hasFailures).observe(totalModules);
}

/**
 * Reset all metrics. Tests use this to assert specific counter values
 * without leaking state between cases.
 *
 * @internal
 */
export function _resetMetricsForTest() {
  moduleRunsTotal.reset();
  moduleDurationMs.reset();
  moduleActive.reset();
  batchRunsTotal.reset();
  batchSize.reset();
}

/** Shared registry — server.js exposes its `metrics()` output via /metrics. */
export const metricsRegistry = registry;
