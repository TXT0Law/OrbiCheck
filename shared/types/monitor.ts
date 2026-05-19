// ============================================================
// Monitor — Shared Type Definitions (Multi-Capability Model)
// ============================================================

// ── Capability System ──

export const MONITOR_CAPABILITIES = [
  "uptime_only",
  "content_change",
  "ssl_expiry",
  "visual_change",
  "dns_change",
  "ct_log",
] as const;

export type MonitorCapability = (typeof MONITOR_CAPABILITIES)[number];

/** @deprecated Use MonitorCapability; kept for gradual migration */
export type MonitorCheckType = MonitorCapability;

/** Monitor status derived from aggregated capability health */
export type MonitorStatus =
  | "up"
  | "down"
  | "degraded"
  | "paused"
  | "pending";

/** Per-capability status (independent of overall monitor status) */
export type CapabilityStatus =
  | "healthy"
  | "warning"
  | "critical"
  | "disabled"
  | "pending"
  | "error";

export type MonitorHttpMethod =
  | "GET"
  | "HEAD"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS";

/** HTTP request extension limits — keep in sync with backend monitor_defaults. */
export const MONITOR_HTTP_BODY_BEARING_METHODS = [
  "POST",
  "PUT",
  "PATCH",
] as const;
export const MONITOR_HTTP_MAX_BODY_BYTES = 64 * 1024;
export const MONITOR_HTTP_MAX_HEADERS_COUNT = 32;
export const MONITOR_HTTP_MAX_HEADER_VALUE_LENGTH = 4096;
export const MONITOR_HTTP_MAX_HEADER_NAME_LENGTH = 128;
export const MONITOR_HTTP_FORBIDDEN_HEADERS: ReadonlySet<string> =
  new Set([
    "host",
    "content-length",
    "transfer-encoding",
    "connection",
    "upgrade",
    "proxy-connection",
    "te",
    "trailer",
  ]);

/** Auth scheme for the per-monitor HTTP probe; "none" clears the secret. */
export type HttpAuthScheme = "none" | "bearer" | "basic";

/** Plaintext payload accepted on create/update; never echoed back. */
export interface HttpAuthInput {
  scheme: HttpAuthScheme;
  /** ``null`` keeps the existing token (update only); required for new bearer/basic. */
  token: string | null;
}

/** Read-side projection used in MonitorResponse — exposes only metadata. */
export interface HttpAuthSummary {
  scheme: HttpAuthScheme;
  configured: boolean;
}

export type CheckErrorType =
  | "timeout"
  | "dns_resolution"
  | "connection_refused"
  | "ssl_error"
  | "http_error"
  | "content_too_large"
  | "unknown";

// ── Interval ──

export const MONITOR_INTERVALS = [
  5, 10, 30, 60, 300, 600,
] as const;
export type MonitorInterval = (typeof MONITOR_INTERVALS)[number];

// ── Per-Capability Alert Policy ──

export interface AlertQuietHours {
  /** HH:mm format, UTC */
  start: string;
  /** HH:mm format, UTC */
  end: string;
}

export interface CapabilityAlertPolicy {
  enabled: boolean;
  /** Min seconds between two notifications for same condition */
  cooldownSeconds: number;
  /** Optional: suppress alerts during window */
  quietHours: AlertQuietHours | null;
}

// ── Capability-Specific Thresholds ──

export interface UptimeThresholds {
  /** Alert if response time exceeds (ms) */
  maxResponseTimeMs: number | null;
  /** Consecutive failures before alert */
  consecutiveFailures: number;
  /** Treat non-2xx as down */
  alertOnUnexpectedStatus: boolean;
}

/** Optional per-monitor regex replacements applied after built-in normalization (P3). */
export interface ContentNormalizationRule {
  pattern: string;
  replacement: string;
}

export type ContentExtractorType = "css" | "xpath" | "jsonpath";

export interface ContentExtractor {
  type: ContentExtractorType;
  expression: string;
}

export interface ContentRestockThresholds {
  enabled: boolean;
  outOfStockKeywords: string[];
  inStockKeywords: string[];
}

export interface ContentThresholds {
  /** Alert on any hash change */
  alertOnChange: boolean;
  /** Ignore changes smaller than N bytes */
  minChangeSizeBytes: number | null;
  /**
   * Minimum unified-diff line churn (added+removed lines) to persist a change.
   * 0 or omit = disabled. Overrides interact with minChangeSizeBytes and server MIN_DIFF_LINES_OVERRIDE.
   */
  minTotalDiffLines?: number | null;
  /**
   * Seconds: suppress **notification** for repeated same diffFingerprint within this window
   * (MonitorChange rows are always stored). 0 = disable time-based repeat suppression.
   */
  dedupWindowSeconds?: number | null;
  /** When true, do not emit notifications for small category changes (rows still stored). */
  alertOnlyMediumOrLarge?: boolean | null;
  /** Alternative to alertOnlyMediumOrLarge: e.g. ["medium","large"] only. */
  alertOnlyCategories?: ("small" | "medium" | "large")[] | null;
  /** Max notifications per diffFingerprint within repeatAlertFingerprintWindowMinutes (both required). */
  repeatAlertMaxNotificationsPerFingerprint?: number | null;
  repeatAlertFingerprintWindowMinutes?: number | null;
  /** Advanced: scope body text via CSS selectors before fingerprint/diff (server flag). */
  selectorExtraction?: {
    selectors: string[];
    mergeStrategy?: "concat_ordered";
    maxExtractedChars?: number;
  } | null;
  /** C-2: ordered extractors appended after selectorExtraction. */
  extractors?: ContentExtractor[] | null;
  /** C-4: emit a restock-flavoured content alert when OOS text becomes in-stock. */
  restock?: ContentRestockThresholds | null;
  /**
   * When true (default), UUIDs and long hex runs are normalized before hashing.
   * Set false to compare raw response bytes like legacy behavior.
   */
  normalizeVolatileTokens?: boolean | null;
  /**
   * When true (default), captcha/risk-check style HTML does not create MonitorChange rows.
   */
  suppressDegradedPageChanges?: boolean | null;
  /** Advanced: ordered regex replacements (bounded; server-enforced limits). */
  normalizationRules?: ContentNormalizationRule[] | null;
  /**
   * C-3: at least one keyword (case-insensitive substring match) must appear
   * in the new body for an alert to fire. Empty list = no constraint.
   */
  triggerWords?: string[] | null;
  /**
   * C-3: any keyword present in the new body suppresses the alert (the
   * change row is still stored for audit). Useful for "currency converter"
   * widgets, cookie banners, etc.
   */
  ignoreWords?: string[] | null;
  /** C-3: optional alternative to triggerWords — full regex. */
  triggerRegex?: string | null;
  /** C-5: select between cheap HTTP fetch and Playwright-rendered DOM. */
  fetchMode?: ContentFetchMode | null;
  /**
   * C-5: per-monitor knobs for the rendered-DOM fetch path. Ignored when
   * fetchMode is omitted or "http". Bounded server-side; the editor
   * surfaces the same caps in the advanced section.
   */
  fetchOptions?: ContentFetchOptions | null;
}

/** C-5: how the monitor obtains the body for content_change comparison. */
export const CONTENT_FETCH_MODES = ["http", "browser"] as const;
export type ContentFetchMode = (typeof CONTENT_FETCH_MODES)[number];

/**
 * C-5: per-monitor browser-fetch knobs. The scan-service caps each value
 * (waitMs ≤ 10s, viewport within 320–3840 / 240–2160) so a malformed
 * config can never tie up the Playwright pool.
 */
export interface ContentFetchOptions {
  waitForSelector?: string | null;
  waitMs?: number | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
}

/** C-5/B-7: minimum check interval when fetchMode === "browser". */
export const MONITOR_BROWSER_FETCH_MIN_INTERVAL_SECONDS = 300;

export interface SslThresholds {
  /** Warning when days remaining <= this */
  warnDaysRemaining: number;
  /** Critical when days remaining <= this */
  criticalDaysRemaining: number;
}

export const MONITOR_DNS_RECORD_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "NS",
  "TXT",
  "CAA",
] as const;
export type MonitorDnsRecordType = (typeof MONITOR_DNS_RECORD_TYPES)[number];
export const MONITOR_MAX_DNS_NAMESERVERS = 8;
export const MONITOR_MAX_CT_PINNED_SERIALS = 32;

export interface DnsThresholds {
  /** Subset of MONITOR_DNS_RECORD_TYPES we'll query each cycle. */
  recordTypes: MonitorDnsRecordType[];
  /** Optional explicit resolvers (IPv4/IPv6); empty = system default. */
  nameservers: string[];
  /** Per-query timeout (seconds, 1-60). */
  queryTimeoutSeconds: number;
  /** Emit alerts when the record set changes. */
  alertOnChange: boolean;
}

export interface CtLogThresholds {
  /**
   * Lower-case hex certificate serial numbers we trust; empty = no pinning.
   * crt.sh's JSON endpoint returns ``serial_number`` (not the full leaf
   * certificate), so pinning happens on serial — pinning on SHA-256 would
   * require an extra HTTP round-trip per entry. RFC 5280 caps serials at
   * 20 octets (40 hex chars); we accept up to 64 chars for lenience.
   */
  pinnedSerials: string[];
  /** Look back N hours when polling crt.sh (1-720). */
  lookbackHours: number;
  /** Emit alerts when a brand new entry is observed. */
  alertOnNewEntry: boolean;
}

/** V-10: supported perceptual hash algorithms. dHash is the default. */
export const VISUAL_HASH_ALGORITHMS = [
  "dhash",
  "phash",
  "ahash",
  "whash",
] as const;
export type VisualHashAlgorithm = (typeof VISUAL_HASH_ALGORITHMS)[number];

/**
 * V-11: percentage-based rectangle (all coords 0-100) to ignore during
 * perceptual hash comparison. Stored alongside the visual_change thresholds;
 * the server fills the rectangle with black before hashing.
 */
export interface VisualIgnoreRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const VISUAL_MAX_IGNORE_REGIONS = 8;

export type VisualBrowserStep =
  | { action: "goto"; url: string }
  | { action: "wait"; ms: number }
  | { action: "scroll" }
  | { action: "click"; selector: string }
  | { action: "type"; selector: string; value: string };

export interface VisualThresholds {
  /**
   * Minimum similarity (0–100) vs previous capture; below triggers a visual change event.
   * Server uses the configured perceptual hash algorithm (Hamming distance, 64-bit).
   */
  similarityThresholdPercent: number | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  fullPage?: boolean | null;
  /** Fallback: match nearest screenshot to content change within ±N seconds (server default 120). */
  contentCorrelationWindowSeconds?: number | null;
  /**
   * V-1: when True, store a screenshot even when the HTTP / SSL probe failed
   * (Cloudflare interstitial, 5xx, TLS handshake error). The capture is
   * flagged `is_diagnostic=true` server-side and never participates in dHash
   * similarity comparison. Defaults to `true` for new monitors.
   */
  captureOnFailure?: boolean | null;
  /**
   * V-10: perceptual hash algorithm to use. Switching the algorithm
   * implicitly re-baselines the monitor — captures with mismatched
   * algorithms are never compared against each other.
   */
  hashAlgorithm?: VisualHashAlgorithm | null;
  /**
   * V-11: rectangles to ignore (mask with black) before hashing. Up to
   * VISUAL_MAX_IGNORE_REGIONS entries. Coordinates are percentages so
   * the same mask survives a viewport change.
   */
  ignoreRegions?: VisualIgnoreRegion[] | null;
  /** V-13: wait before screenshot capture for SPA/lazy-loaded content. */
  waitFor?: {
    selector?: string | null;
    timeoutMs?: number | null;
  } | null;
  /**
   * V-14: bounded browser steps. Interactive click/type are feature-flagged
   * server-side; goto/wait/scroll are safe defaults.
   */
  steps?: VisualBrowserStep[] | null;
}

/** Maps capability type to its threshold shape */
export interface CapabilityThresholdsMap {
  uptime_only: UptimeThresholds;
  content_change: ContentThresholds;
  ssl_expiry: SslThresholds;
  visual_change: VisualThresholds;
  dns_change: DnsThresholds;
  ct_log: CtLogThresholds;
}

// ── Per-Capability Config ──

export interface PerCapabilityConfig<
  T extends MonitorCapability = MonitorCapability,
> {
  enabled: boolean;
  alert: CapabilityAlertPolicy;
  thresholds: CapabilityThresholdsMap[T];
  /** Phase 2: override global interval for this capability */
  intervalOverrideSeconds: number | null;
}

/** Full capabilities record on a Monitor */
export type MonitorCapabilities = {
  [K in MonitorCapability]: PerCapabilityConfig<K>;
};

// ── Capability Status Summary (for SubNav dots + Overview cards) ──

export interface CapabilityStatusSummary {
  capability: MonitorCapability;
  status: CapabilityStatus;
  lastCheckAt: string | null;
  lastValue: string | null;
  /** Human-readable one-liner, e.g. "99.8% uptime (24h)" */
  summary: string | null;
}

// ── Core Models ──

export interface Monitor {
  id: string;
  displayName: string;
  url: string;
  /** Which capabilities are turned on */
  enabledCapabilities: MonitorCapability[];
  /** Full per-capability configuration */
  capabilities: MonitorCapabilities;
  /** Global default interval (capabilities may override) */
  intervalSeconds: number;
  httpMethod: MonitorHttpMethod;
  /** Phase 1.1: optional UTF-8 body for POST/PUT/PATCH probes. */
  httpBody?: string | null;
  /** Phase 1.1: extra request headers (validated server-side). */
  httpHeaders?: Record<string, string> | null;
  /** Phase 1.1: read-only projection — actual token never leaves backend. */
  httpAuth?: HttpAuthSummary;
  expectedStatusCode: number | null;
  isEnabled: boolean;
  /** Aggregated status across all enabled capabilities */
  status: MonitorStatus;
  /** Per-capability status for SubNav indicators */
  capabilityStatuses: CapabilityStatusSummary[];
  lastCheckAt: string | null;
  lastStatusCode: number | null;
  lastResponseTimeMs: number | null;
  lastChangeDetectedAt: string | null;
  sslExpiryDays: number | null;
  totalChecks: number;
  uptimePercentage: number | null;
  avgResponseTimeMs: number | null;
  p50ResponseTimeMs?: number | null;
  p95ResponseTimeMs?: number | null;
  p99ResponseTimeMs?: number | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// ── Check Result ──

export interface MonitorCheck {
  id: string;
  monitorId: string;
  checkedAt: string;
  success: boolean;
  statusCode: number | null;
  responseTimeMs: number;
  errorType: CheckErrorType | null;
  errorMessage: string | null;
  contentHash: string | null;
  contentChanged: boolean;
  snapshotId: string | null;
  sslDaysRemaining: number | null;
  /** Which capabilities were evaluated in this check */
  evaluatedCapabilities: MonitorCapability[];
}

// ── Snapshot & Change (content_change capability) ──

export interface MonitorSnapshot {
  id: string;
  monitorId: string;
  checkId: string;
  capturedAt: string;
  contentHash: string;
  contentSizeBytes: number;
}

export interface MonitorChange {
  id: string;
  monitorId: string;
  detectedAt: string;
  previousSnapshotId: string;
  currentSnapshotId: string;
  /** Present when visual_change is enabled and a capture was correlated. */
  linkedVisualCaptureId?: string | null;
  /** How the screenshot was matched to this content change (API). */
  linkedVisualCorrelation?: "check_id" | "time_window" | null;
  diffSummary: {
    linesAdded: number;
    linesRemoved: number;
    linesChanged: number;
    totalDiffLines?: number;
    /** Aligns with server CHANGE_CATEGORY_* and size filter when loaded from API */
    changeCategory?: "small" | "medium" | "large";
    diffFingerprint?: string;
    /** First hunk line preview from server (timeline) */
    previewLine?: string;
    eventType?: "content_change" | "content_restock";
    matchedRestockWord?: string;
  };
}

/** GET /monitors/:id/content/baseline — canonical baseline snapshot for content monitoring. */
export interface MonitorBaseline {
  snapshotId: string;
  capturedAt: string;
  contentHash: string;
  contentSizeBytes: number;
  contentType?: string | null;
  charset?: string | null;
  httpStatusCode?: number | null;
  isBaseline?: boolean;
}

export interface MonitorDiff {
  changeId: string;
  previousContent: string;
  currentContent: string;
  diffHtml: string;
  /** True when server truncated snapshot text for the diff endpoint. */
  truncated?: boolean;
  originalPreviousLength?: number;
  originalCurrentLength?: number;
  linkedVisualCaptureId?: string | null;
  linkedVisualCorrelation?: "check_id" | "time_window" | null;
  wordDiff?: {
    tokensAdded: number;
    tokensRemoved: number;
    totalTokenChanges: number;
    operations: Array<{
      type: string;
      removed: string[];
      added: string[];
    }>;
    truncated: boolean;
  } | null;
}

/** Periodic screenshot capture for visual_change. */
export interface MonitorVisualCapture {
  id: string;
  monitorId: string;
  checkId: string | null;
  capturedAt: string;
  widthPx: number;
  heightPx: number;
  viewportWidth: number;
  viewportHeight: number;
  fullPage: boolean;
  perceptualHashHex: string | null;
  dhashAlgo: string;
  /**
   * V-1: True for captures stored even though the probe failed (bot wall,
   * TLS error, 5xx). Diagnostic captures never participate in dHash
   * similarity comparison.
   */
  isDiagnostic?: boolean;
}

/** Visual regression row (perceptual hash similarity). */
export interface MonitorVisualChange {
  id: string;
  monitorId: string;
  detectedAt: string;
  previousCaptureId: string;
  currentCaptureId: string;
  diffSummary: {
    hammingDistance?: number;
    similarityPercent?: number;
    perceptualHashAlgo?: string;
    similarityThresholdPercent?: number;
    changedBlocks?: number[];
  };
}

// ── SSL Detail (ssl_expiry capability) ──

export interface MonitorSslStatus {
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number | null;
  isExpiringSoon: boolean;
  isExpired: boolean;
  /** SAN entries */
  subjectAlternativeNames: string[];
  /** Certificate chain summary (API may send subjectDn / issuerDn) */
  chainSummary: Array<{
    subject?: string;
    subjectDn?: string;
    issuer?: string;
    issuerDn?: string;
    validTo?: string;
    validFrom?: string;
  }>;
  lastCheckedAt: string | null;
  /** Derived from thresholds; API may send "warning" — normalized in client to "warn" */
  severityLevel: "ok" | "warn" | "critical" | "expired" | "unknown";
}

// ── Time Series & Aggregation ──

/** Legacy per-probe row (mock / older API). */
export interface MonitorTimeSeriesPoint {
  timestamp: string;
  responseTimeMs: number | null;
  statusCode: number | null;
  success: boolean;
}

/** Aggregated bucket from GET /monitors/:id/series (camelCase from API). */
export interface MonitorTimeSeriesBucket {
  timestamp: string;
  successRate: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p50ResponseTime?: number;
  p95ResponseTime?: number;
  p99ResponseTime?: number;
  checkCount: number;
}

export interface MonitorTimeSeriesData {
  period: "24h" | "7d" | "30d" | "90d";
  resolution: string;
  points: MonitorTimeSeriesBucket[];
}

export interface MonitorUptimeSummary {
  period: "24h" | "7d" | "30d" | "90d";
  totalChecks: number;
  successfulChecks: number;
  failedChecks?: number;
  uptimePercentage: number;
  avgResponseTimeMs: number;
  p50ResponseTimeMs?: number;
  p95ResponseTimeMs: number;
  p99ResponseTimeMs?: number;
  incidents: number;
  currentStreak?: {
    status: string;
    since: string;
    durationSeconds: number;
  };
  failureDistribution?: Record<string, number>;
}

// ── Request Types ──

export interface MonitorCreateRequest {
  displayName: string;
  url: string;
  /** At least one capability must be selected */
  enabledCapabilities: MonitorCapability[];
  /** Per-capability config (optional on create — defaults applied server-side) */
  capabilities?: Partial<MonitorCapabilities>;
  intervalSeconds: number;
  httpMethod: MonitorHttpMethod;
  /** Phase 1.1 */
  httpBody?: string | null;
  httpHeaders?: Record<string, string> | null;
  httpAuth?: HttpAuthInput | null;
  expectedStatusCode: number | null;
  tags: string[];
}

export interface MonitorUpdateRequest {
  displayName?: string;
  url?: string;
  enabledCapabilities?: MonitorCapability[];
  capabilities?: Partial<MonitorCapabilities>;
  intervalSeconds?: number;
  httpMethod?: MonitorHttpMethod;
  /** Phase 1.1 */
  httpBody?: string | null;
  httpHeaders?: Record<string, string> | null;
  httpAuth?: HttpAuthInput | null;
  /** Set true to drop the stored body / headers without supplying a replacement. */
  clearHttpBody?: boolean;
  clearHttpHeaders?: boolean;
  expectedStatusCode?: number | null;
  isEnabled?: boolean;
  tags?: string[];
}

export interface MonitorListMeta {
  page: number;
  limit: number;
  total: number;
}

// ── Phase 1.3 / 1.4: list filters & sort (mirror backend list_monitors) ──

/** ``any`` (default) overlaps the tag set; ``all`` requires every tag to be present. */
export type MonitorTagMatch = "any" | "all";

/** Whitelisted sort fields — keep in sync with `_LIST_SORT_COLUMNS` in monitor_service.py. */
export const MONITOR_LIST_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "displayName",
  "lastCheckAt",
  "lastResponseTimeMs",
  "uptimePercentage",
] as const;
export type MonitorListSortField = (typeof MONITOR_LIST_SORT_FIELDS)[number];
export type MonitorListSortDirection = "asc" | "desc";

/** Encoded as `<field>:<direction>` on the wire for the `?sort=` query param. */
export interface MonitorListSort {
  field: MonitorListSortField;
  direction: MonitorListSortDirection;
}

export interface MonitorListFilters {
  status?: string;
  search?: string;
  tags?: string[];
  tagMatch?: MonitorTagMatch;
  latencyMaxMs?: number | null;
  uptimeMinPercent?: number | null;
  sort?: MonitorListSort | null;
  page?: number;
  limit?: number;
}

export interface MonitorIncident {
  id: string;
  monitorId: string;
  capability: MonitorCapability;
  type: "downtime" | "ssl_warning" | "ssl_critical" | "content_change" | "degraded";
  startedAt: string;
  resolvedAt: string | null;
  durationSeconds: number | null;
  title: string;
  description: string;
}

export interface AlertEvent {
  id: string;
  monitorId: string;
  capability: MonitorCapability;
  eventType: string;
  severity: "info" | "warning" | "critical";
  thresholdConfig: Record<string, unknown>;
  actualValue: string;
  message: string;
  dispatchedChannels: string[];
  suppressed: boolean;
  suppressReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy?: string | null;
}

// ── Phase 2.2 — DNS records & changes ──

export interface MonitorDnsRecord {
  id: string;
  monitorId: string;
  recordType: MonitorDnsRecordType;
  values: string[];
  observedAt: string;
  lastChangeAt: string | null;
}

export interface MonitorDnsChange {
  id: string;
  monitorId: string;
  recordType: MonitorDnsRecordType;
  detectedAt: string;
  previousValues: string[];
  currentValues: string[];
  addedValues: string[];
  removedValues: string[];
}

// ── Phase 2.3 — Certificate Transparency entries ──

export interface MonitorCtEntry {
  id: string;
  monitorId: string;
  hostname: string;
  serialNumber: string;
  leafSha256: string | null;
  issuerName: string | null;
  commonName: string | null;
  notBefore: string | null;
  notAfter: string | null;
  observedAt: string;
  crtshId: string | null;
  pinViolation: boolean;
  alertedAt: string | null;
}

// ── Phase 2.4 / 2b — Maintenance windows ──

/** RRULE-lite recurrence spec stored on a maintenance window. */
export type MaintenanceRecurrenceFreq = "daily" | "weekly";

export interface MaintenanceRecurrenceSpec {
  freq: MaintenanceRecurrenceFreq;
  /** Allowed weekdays (0=Mon … 6=Sun). Only meaningful for `weekly`. */
  byWeekday?: number[] | null;
  /** Inclusive ISO timestamp; recurrence stops after this. */
  untilAt?: string | null;
}

export interface MaintenanceWindow {
  id: string;
  userId: number;
  monitorId: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  suppressAlerts: boolean;
  suppressProbes: boolean;
  isEnabled: boolean;
  notes: string | null;
  recurrence: MaintenanceRecurrenceSpec | null;
  /** When non-empty, only monitors with intersecting tags are matched. */
  tagScope: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceWindowCreateRequest {
  monitorId?: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  suppressAlerts?: boolean;
  suppressProbes?: boolean;
  isEnabled?: boolean;
  notes?: string | null;
  recurrence?: MaintenanceRecurrenceSpec | null;
  tagScope?: string[] | null;
}

export interface MaintenanceWindowUpdateRequest {
  monitorId?: string | null;
  clearMonitorScope?: boolean;
  title?: string;
  startsAt?: string;
  endsAt?: string;
  suppressAlerts?: boolean;
  suppressProbes?: boolean;
  isEnabled?: boolean;
  notes?: string | null;
  recurrence?: MaintenanceRecurrenceSpec | null;
  clearRecurrence?: boolean;
  tagScope?: string[] | null;
  clearTagScope?: boolean;
}
