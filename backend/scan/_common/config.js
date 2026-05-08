// Centralised scan-service configuration (TASK-P3-3).
//
// Before this module:
//   - server.js hard-coded the EXTENDED_TIMEOUT_MODULES set and the two
//     timeout values, so any new "slow" module had to edit server.js.
//   - registry.js had no concept of disabling a module without editing the
//     EXCLUDED_FILES list.
//   - There was no single place that documented batch concurrency, retry,
//     etc.
//
// After this module:
//   - One source of truth (`SCAN_CONFIG`) drives both the runtime registry
//     and the runner's per-module timeouts.
//   - Operators can flip a module off via `SCAN_MODULES_DISABLED=tls,ports`
//     without code changes.
//   - Per-module timeout overrides land via env (`MODULE_TIMEOUT_TLS_MS`)
//     so e.g. ops can extend `ports` past 60s without redeploys.
//
// Boundary:
//   This file may not import from any other module under `backend/scan/`.
//   It is a pure config layer that gets imported by registry/server/runner.

const FALLBACK_MODULE_TIMEOUT_MS = 30000;
const FALLBACK_EXTENDED_TIMEOUT_MS = 60000;
const FALLBACK_BATCH_CONCURRENCY = 10;
const FALLBACK_RETRY_COUNT = 2;
const FALLBACK_RETRY_BASE_MS = 300;

// Modules that historically need more than the default 30s due to upstream
// rate-limits, browser launch, or nmap fallback. Operators can still extend
// any module via per-module env override (`MODULE_TIMEOUT_<UPPER>_MS`).
const DEFAULT_EXTENDED_MODULES = new Set([
  'whois', // HK rate-limit retry waits ~12s
  'screenshot', // chromium boot + render
  'tech-stack', // wappalyzer worker
  'ports', // nmap or fallback native scan
  'tls', // tls.connect handshake retries
  'cookies', // chromium navigation
]);

function parseList(value) {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function envKeyForModule(moduleName) {
  // 'tech-stack' -> 'MODULE_TIMEOUT_TECH_STACK_MS'
  return `MODULE_TIMEOUT_${moduleName.toUpperCase().replace(/-/g, '_')}_MS`;
}

function readPositiveInt(envName, fallback) {
  const raw = process.env[envName];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function readNonNegativeInt(envName, fallback) {
  const raw = process.env[envName];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

/**
 * Resolve the runtime-effective timeout for a single module.
 *
 * Resolution order (highest precedence first):
 *   1. Per-module env var (e.g. `MODULE_TIMEOUT_TLS_MS`)
 *   2. Extended modules list -> EXTENDED_MODULE_TIMEOUT_MS
 *   3. Default -> MODULE_TIMEOUT_MS
 *
 * @param {string} moduleName Kebab-case module identifier (e.g. `tech-stack`).
 * @returns {number} Timeout in milliseconds.
 */
export function getModuleTimeoutMs(moduleName) {
  const override = process.env[envKeyForModule(moduleName)];
  if (override) {
    const parsed = parseInt(override, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (DEFAULT_EXTENDED_MODULES.has(moduleName)) {
    return readPositiveInt('EXTENDED_MODULE_TIMEOUT_MS', FALLBACK_EXTENDED_TIMEOUT_MS);
  }
  return readPositiveInt('MODULE_TIMEOUT_MS', FALLBACK_MODULE_TIMEOUT_MS);
}

/**
 * Operator-facing kill switch. Modules listed in `SCAN_MODULES_DISABLED`
 * are still present on disk but skipped at registry load time and from the
 * batch path's auto-discovery list.
 *
 * @param {string} moduleName
 * @returns {boolean} `false` if the module is explicitly disabled.
 */
export function isModuleEnabled(moduleName) {
  const disabled = getDisabledModules();
  if (disabled.includes(moduleName)) return false;
  // Inverse whitelist: when SCAN_MODULES_ENABLED is set, *only* those are
  // enabled. Useful for canary deploys / debug runs.
  const enabled = getEnabledModules();
  if (enabled.length > 0 && !enabled.includes(moduleName)) return false;
  return true;
}

/**
 * @returns {string[]} Module names listed in `SCAN_MODULES_DISABLED`.
 */
export function getDisabledModules() {
  return parseList(process.env.SCAN_MODULES_DISABLED);
}

/**
 * @returns {string[]} Module names listed in `SCAN_MODULES_ENABLED`. Empty
 *                     means "enable all (minus disabled)".
 */
export function getEnabledModules() {
  return parseList(process.env.SCAN_MODULES_ENABLED);
}

/**
 * Maximum number of modules executed in parallel per batch request.
 * Used by p-limit in server.js batch path.
 */
export function getBatchConcurrency() {
  return readPositiveInt('SCAN_BATCH_CONCURRENCY', FALLBACK_BATCH_CONCURRENCY);
}

/**
 * @returns {{ retries: number, baseMs: number }} Retry policy for the shared
 *   axios instance (`_common/http.js`). Applies only to idempotent (GET)
 *   requests on transient (5xx, 429, ECONNRESET) failures.
 */
export function getHttpRetryPolicy() {
  return {
    retries: readNonNegativeInt('SCAN_HTTP_RETRY_COUNT', FALLBACK_RETRY_COUNT),
    baseMs: readPositiveInt('SCAN_HTTP_RETRY_BASE_MS', FALLBACK_RETRY_BASE_MS),
  };
}

/**
 * Snapshot of all derived values, useful for `/health` / debug pages.
 * Intentionally re-reads env so tests can mutate process.env between
 * assertions without rebuilding the module.
 */
export function describeConfig() {
  return {
    moduleTimeoutMs: readPositiveInt('MODULE_TIMEOUT_MS', FALLBACK_MODULE_TIMEOUT_MS),
    extendedTimeoutMs: readPositiveInt('EXTENDED_MODULE_TIMEOUT_MS', FALLBACK_EXTENDED_TIMEOUT_MS),
    extendedModules: [...DEFAULT_EXTENDED_MODULES].sort(),
    disabledModules: getDisabledModules(),
    enabledModules: getEnabledModules(),
    batchConcurrency: getBatchConcurrency(),
    httpRetry: getHttpRetryPolicy(),
  };
}

export const SCAN_CONFIG_DEFAULTS = Object.freeze({
  DEFAULT_MODULE_TIMEOUT_MS: FALLBACK_MODULE_TIMEOUT_MS,
  DEFAULT_EXTENDED_TIMEOUT_MS: FALLBACK_EXTENDED_TIMEOUT_MS,
  DEFAULT_BATCH_CONCURRENCY: FALLBACK_BATCH_CONCURRENCY,
  DEFAULT_EXTENDED_MODULES: [...DEFAULT_EXTENDED_MODULES],
});
