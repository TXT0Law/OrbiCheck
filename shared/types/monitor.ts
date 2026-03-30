// ============================================================
// Monitor — Shared Type Definitions (Multi-Capability Model)
// ============================================================

// ── Capability System ──

export const MONITOR_CAPABILITIES = [
  "uptime_only",
  "content_change",
  "ssl_expiry",
  "visual_change",
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

export type MonitorHttpMethod = "GET" | "HEAD" | "POST";

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
}

export interface SslThresholds {
  /** Warning when days remaining <= this */
  warnDaysRemaining: number;
  /** Critical when days remaining <= this */
  criticalDaysRemaining: number;
}

export interface VisualThresholds {
  /**
   * Minimum similarity (0–100) vs previous capture; below triggers a visual change event.
   * Server uses dHash Hamming distance (64-bit).
   */
  similarityThresholdPercent: number | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  fullPage?: boolean | null;
  /** Fallback: match nearest screenshot to content change within ±N seconds (server default 120). */
  contentCorrelationWindowSeconds?: number | null;
}

/** Maps capability type to its threshold shape */
export interface CapabilityThresholdsMap {
  uptime_only: UptimeThresholds;
  content_change: ContentThresholds;
  ssl_expiry: SslThresholds;
  visual_change: VisualThresholds;
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
  p95ResponseTimeMs: number;
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
  expectedStatusCode?: number | null;
  isEnabled?: boolean;
  tags?: string[];
}

export interface MonitorListMeta {
  page: number;
  limit: number;
  total: number;
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
