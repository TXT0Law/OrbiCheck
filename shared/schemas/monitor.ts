import { z } from "zod";

import { MONITOR_INTERVALS, MONITOR_CAPABILITIES } from "../types/monitor";

const monitorCapabilityEnum = z.enum([
  MONITOR_CAPABILITIES[0],
  MONITOR_CAPABILITIES[1],
  MONITOR_CAPABILITIES[2],
  MONITOR_CAPABILITIES[3],
  MONITOR_CAPABILITIES[4],
  MONITOR_CAPABILITIES[5],
]);

const dnsRecordTypeEnum = z.enum([
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "NS",
  "TXT",
  "CAA",
]);

// ── Alert Policy ──

const alertQuietHoursSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:mm format"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:mm format"),
});

const capabilityAlertPolicySchema = z.object({
  enabled: z.boolean().default(true),
  cooldownSeconds: z.number().int().min(0).max(86400).default(300),
  quietHours: alertQuietHoursSchema.nullable().default(null),
});

// ── Per-Capability Thresholds ──

const uptimeThresholdsSchema = z.object({
  maxResponseTimeMs: z.number().int().min(100).max(60000).nullable().default(null),
  consecutiveFailures: z.number().int().min(1).max(100).default(3),
  alertOnUnexpectedStatus: z.boolean().default(true),
});

const contentNormalizationRuleSchema = z.object({
  pattern: z.string().max(500),
  replacement: z.string().max(200),
});

const selectorExtractionSchema = z.object({
  selectors: z.array(z.string().max(500)).max(8),
  mergeStrategy: z.literal("concat_ordered").optional(),
  maxExtractedChars: z.number().int().min(1024).max(500_000).optional(),
});

const contentThresholdsSchema = z.object({
  alertOnChange: z.boolean().default(true),
  minChangeSizeBytes: z.number().int().min(0).nullable().default(null),
  minTotalDiffLines: z.number().int().min(0).max(1_000_000).nullable().optional(),
  dedupWindowSeconds: z.number().int().min(0).max(86400).nullable().optional(),
  alertOnlyMediumOrLarge: z.boolean().nullable().optional(),
  alertOnlyCategories: z
    .array(z.enum(["small", "medium", "large"]))
    .max(3)
    .nullable()
    .optional(),
  repeatAlertMaxNotificationsPerFingerprint: z.number().int().min(1).max(1000).nullable().optional(),
  repeatAlertFingerprintWindowMinutes: z.number().int().min(1).max(10080).nullable().optional(),
  selectorExtraction: selectorExtractionSchema.nullable().optional(),
  normalizeVolatileTokens: z.boolean().nullable().optional(),
  suppressDegradedPageChanges: z.boolean().nullable().optional(),
  normalizationRules: z.array(contentNormalizationRuleSchema).max(10).nullable().optional(),
});

const sslThresholdsSchema = z.object({
  warnDaysRemaining: z.number().int().min(1).max(365).default(30),
  criticalDaysRemaining: z.number().int().min(1).max(90).default(7),
});

const visualThresholdsSchema = z.object({
  similarityThresholdPercent: z.number().min(50).max(100).nullable().optional(),
  viewportWidth: z.number().int().min(320).max(3840).optional(),
  viewportHeight: z.number().int().min(240).max(2160).optional(),
  fullPage: z.boolean().optional(),
  contentCorrelationWindowSeconds: z.number().int().min(0).max(86400).nullable().optional(),
});

const dnsThresholdsSchema = z.object({
  recordTypes: z.array(dnsRecordTypeEnum).min(1).max(7),
  nameservers: z.array(z.string().min(1).max(45)).max(8).default([]),
  queryTimeoutSeconds: z.number().int().min(1).max(60).default(5),
  alertOnChange: z.boolean().default(true),
});

const ctLogThresholdsSchema = z.object({
  // X.509 serial numbers are variable-length hex (RFC 5280 caps at 20 octets,
  // i.e. 40 hex chars; we accept up to 64 to tolerate non-conformant CAs).
  pinnedSerials: z
    .array(z.string().regex(/^[A-Fa-f0-9]{1,64}$/, "Hex certificate serial (1-64 chars)"))
    .max(32)
    .default([]),
  lookbackHours: z.number().int().min(1).max(720).default(24),
  alertOnNewEntry: z.boolean().default(true),
});

// ── Per-Capability Config (optional partial patches) ──

const uptimeCapabilitySchema = z.object({
  enabled: z.boolean().optional(),
  alert: capabilityAlertPolicySchema.partial().optional(),
  thresholds: uptimeThresholdsSchema.partial().optional(),
  intervalOverrideSeconds: z.number().int().min(1).max(86400).nullable().optional(),
});

const contentCapabilitySchema = z.object({
  enabled: z.boolean().optional(),
  alert: capabilityAlertPolicySchema.partial().optional(),
  thresholds: contentThresholdsSchema.partial().optional(),
  intervalOverrideSeconds: z.number().int().min(1).max(86400).nullable().optional(),
});

const sslCapabilitySchema = z.object({
  enabled: z.boolean().optional(),
  alert: capabilityAlertPolicySchema.partial().optional(),
  thresholds: sslThresholdsSchema.partial().optional(),
  intervalOverrideSeconds: z.number().int().min(1).max(86400).nullable().optional(),
});

const visualCapabilitySchema = z.object({
  enabled: z.boolean().optional(),
  alert: capabilityAlertPolicySchema.partial().optional(),
  thresholds: visualThresholdsSchema.partial().optional(),
  intervalOverrideSeconds: z.number().int().min(1).max(86400).nullable().optional(),
});

const dnsCapabilitySchema = z.object({
  enabled: z.boolean().optional(),
  alert: capabilityAlertPolicySchema.partial().optional(),
  thresholds: dnsThresholdsSchema.partial().optional(),
  intervalOverrideSeconds: z.number().int().min(1).max(86400).nullable().optional(),
});

const ctCapabilitySchema = z.object({
  enabled: z.boolean().optional(),
  alert: capabilityAlertPolicySchema.partial().optional(),
  thresholds: ctLogThresholdsSchema.partial().optional(),
  intervalOverrideSeconds: z.number().int().min(1).max(86400).nullable().optional(),
});

export const monitorCapabilitiesSchema = z.object({
  uptime_only: uptimeCapabilitySchema.optional(),
  content_change: contentCapabilitySchema.optional(),
  ssl_expiry: sslCapabilitySchema.optional(),
  visual_change: visualCapabilitySchema.optional(),
  dns_change: dnsCapabilitySchema.optional(),
  ct_log: ctCapabilitySchema.optional(),
});

// ── HTTP request extension schemas (Phase 1.1) ──

const HTTP_BODY_BEARING_METHODS = new Set(["POST", "PUT", "PATCH"]);
const HTTP_FORBIDDEN_HEADERS = new Set([
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
  "upgrade",
  "proxy-connection",
  "te",
  "trailer",
]);
const HTTP_HEADER_NAME_PATTERN = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;
const MAX_REQUEST_BODY_BYTES = 64 * 1024;
const MAX_REQUEST_HEADERS_COUNT = 32;
const MAX_REQUEST_HEADER_NAME_LENGTH = 128;
const MAX_REQUEST_HEADER_VALUE_LENGTH = 4096;

export const requestHttpMethodSchema = z.enum([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

const httpAuthSchemeSchema = z.enum(["none", "bearer", "basic"]);

export const httpAuthInputSchema = z
  .object({
    scheme: httpAuthSchemeSchema,
    token: z.string().max(4096).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scheme === "none") return;
    if (value.token == null) return;
    if (!value.token.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Auth token cannot be blank",
        path: ["token"],
      });
    }
    if (/[\r\n]/.test(value.token)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Auth token cannot contain newlines",
        path: ["token"],
      });
    }
  });

export const httpAuthSummarySchema = z
  .object({
    scheme: httpAuthSchemeSchema,
    configured: z.boolean(),
  })
  .passthrough();

export const httpHeadersSchema = z
  .record(z.string(), z.string())
  .superRefine((value, ctx) => {
    const entries = Object.entries(value);
    if (entries.length > MAX_REQUEST_HEADERS_COUNT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `httpHeaders supports at most ${MAX_REQUEST_HEADERS_COUNT} entries`,
      });
    }
    for (const [rawName, rawValue] of entries) {
      const name = rawName.trim();
      if (!name) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "httpHeaders name must be non-empty",
          path: [rawName],
        });
        continue;
      }
      if (name.length > MAX_REQUEST_HEADER_NAME_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `httpHeaders name exceeds ${MAX_REQUEST_HEADER_NAME_LENGTH} chars`,
          path: [rawName],
        });
      }
      if (!HTTP_HEADER_NAME_PATTERN.test(name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `httpHeaders name "${name}" contains invalid characters`,
          path: [rawName],
        });
      }
      if (HTTP_FORBIDDEN_HEADERS.has(name.toLowerCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `httpHeaders cannot override reserved header "${name}"`,
          path: [rawName],
        });
      }
      if (/[\r\n]/.test(rawValue)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "httpHeaders values cannot contain newlines",
          path: [rawName],
        });
      }
      if (rawValue.length > MAX_REQUEST_HEADER_VALUE_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `httpHeaders value exceeds ${MAX_REQUEST_HEADER_VALUE_LENGTH} chars`,
          path: [rawName],
        });
      }
    }
  });

export const httpBodySchema = z
  .string()
  .superRefine((value, ctx) => {
    const bytes = new TextEncoder().encode(value).length;
    if (bytes > MAX_REQUEST_BODY_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `httpBody exceeds ${MAX_REQUEST_BODY_BYTES} bytes`,
      });
    }
  });

// ── Create / Update Schemas ──

export const monitorCreateSchema = z.object({
  displayName: z.string().min(1, "Display name is required").max(100),
  url: z
    .string()
    .url("Must be a valid URL")
    .refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
      message: "URL must start with http(s)://",
    }),
  enabledCapabilities: z
    .array(monitorCapabilityEnum)
    .min(1, "Select at least one capability"),
  capabilities: monitorCapabilitiesSchema.optional(),
  intervalSeconds: z
    .number()
    .int()
    .min(5)
    .max(600)
    .refine(
      (v) => (MONITOR_INTERVALS as readonly number[]).includes(v),
      "Invalid interval"
    ),
  httpMethod: requestHttpMethodSchema.default("GET"),
  httpBody: httpBodySchema.nullable().optional(),
  httpHeaders: httpHeadersSchema.nullable().optional(),
  httpAuth: httpAuthInputSchema.nullable().optional(),
  expectedStatusCode: z.number().int().min(100).max(599).nullable().default(null),
  tags: z.array(z.string().max(50)).max(10).default([]),
}).superRefine((value, ctx) => {
  if (value.httpBody && !HTTP_BODY_BEARING_METHODS.has(value.httpMethod)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `httpBody not allowed for method ${value.httpMethod}`,
      path: ["httpBody"],
    });
  }
});

// `monitorCreateSchema` is wrapped by superRefine, so re-derive base shape
// for the partial update schema (zod cannot `.partial()` an effects schema).
const monitorUpdateBaseShape = z.object({
  displayName: z.string().min(1).max(100).optional(),
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith("http://") || u.startsWith("https://"))
    .optional(),
  enabledCapabilities: z.array(monitorCapabilityEnum).min(1).optional(),
  capabilities: monitorCapabilitiesSchema.optional(),
  intervalSeconds: z
    .number()
    .int()
    .min(5)
    .max(600)
    .optional(),
  httpMethod: requestHttpMethodSchema.optional(),
  httpBody: httpBodySchema.nullable().optional(),
  httpHeaders: httpHeadersSchema.nullable().optional(),
  httpAuth: httpAuthInputSchema.nullable().optional(),
  clearHttpBody: z.boolean().optional(),
  clearHttpHeaders: z.boolean().optional(),
  expectedStatusCode: z.number().int().min(100).max(599).nullable().optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  isEnabled: z.boolean().optional(),
});

export const monitorUpdateSchema = monitorUpdateBaseShape.superRefine(
  (value, ctx) => {
    if (
      value.httpBody &&
      value.httpMethod &&
      !HTTP_BODY_BEARING_METHODS.has(value.httpMethod)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `httpBody not allowed for method ${value.httpMethod}`,
        path: ["httpBody"],
      });
    }
  }
);

export type MonitorCreateInput = z.infer<typeof monitorCreateSchema>;
export type MonitorUpdateInput = z.infer<typeof monitorUpdateSchema>;

// ============================================================
// Response schemas — used by frontend `lib/api/monitors.ts` to
// validate every payload crossing the HTTP / SSE boundary.
//
// These intentionally accept legacy snake_case alongside camelCase
// keys (the frontend `normalizeMonitor` helper folds them after parse)
// and prefer permissive optional fields over strict shape rejection
// to avoid bouncing valid responses while a backend migration is in
// flight. Each schema only describes the response surface the UI
// actually consumes; ad-hoc extra fields pass through untouched.
// ============================================================

const PERIOD_VALUES = ["24h", "7d", "30d", "90d"] as const;
const periodSchema = z.enum(PERIOD_VALUES);

const monitorStatusSchema = z.enum([
  "up",
  "down",
  "degraded",
  "paused",
  "pending",
]);

const checkErrorTypeSchema = z.enum([
  "timeout",
  "dns_resolution",
  "connection_refused",
  "ssl_error",
  "http_error",
  "content_too_large",
  "unknown",
]);

const capabilityStatusSchema = z.enum([
  "healthy",
  "warning",
  "critical",
  "disabled",
  "pending",
  "error",
]);

const httpMethodSchema = z.enum([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

const capabilityStatusSummarySchema = z.object({
  capability: monitorCapabilityEnum,
  status: capabilityStatusSchema,
  lastCheckAt: z.string().nullable(),
  lastValue: z.string().nullable(),
  summary: z.string().nullable(),
});

// Per-capability response config — server may omit nested defaults; accept
// a permissive object so missing optional sub-fields don't reject payloads.
const responseAlertPolicySchema = z
  .object({
    enabled: z.boolean().optional(),
    cooldownSeconds: z.number().int().min(0).optional(),
    quietHours: alertQuietHoursSchema.nullable().optional(),
  })
  .passthrough();

const responseUptimeCapabilitySchema = z
  .object({
    enabled: z.boolean().optional(),
    alert: responseAlertPolicySchema.optional(),
    thresholds: uptimeThresholdsSchema.partial().optional(),
    intervalOverrideSeconds: z.number().int().nullable().optional(),
  })
  .passthrough();

const responseContentCapabilitySchema = z
  .object({
    enabled: z.boolean().optional(),
    alert: responseAlertPolicySchema.optional(),
    thresholds: contentThresholdsSchema.partial().optional(),
    intervalOverrideSeconds: z.number().int().nullable().optional(),
  })
  .passthrough();

const responseSslCapabilitySchema = z
  .object({
    enabled: z.boolean().optional(),
    alert: responseAlertPolicySchema.optional(),
    thresholds: sslThresholdsSchema.partial().optional(),
    intervalOverrideSeconds: z.number().int().nullable().optional(),
  })
  .passthrough();

const responseVisualCapabilitySchema = z
  .object({
    enabled: z.boolean().optional(),
    alert: responseAlertPolicySchema.optional(),
    thresholds: visualThresholdsSchema.partial().optional(),
    intervalOverrideSeconds: z.number().int().nullable().optional(),
  })
  .passthrough();

const responseDnsCapabilitySchema = z
  .object({
    enabled: z.boolean().optional(),
    alert: responseAlertPolicySchema.optional(),
    thresholds: dnsThresholdsSchema.partial().optional(),
    intervalOverrideSeconds: z.number().int().nullable().optional(),
  })
  .passthrough();

const responseCtCapabilitySchema = z
  .object({
    enabled: z.boolean().optional(),
    alert: responseAlertPolicySchema.optional(),
    thresholds: ctLogThresholdsSchema.partial().optional(),
    intervalOverrideSeconds: z.number().int().nullable().optional(),
  })
  .passthrough();

const monitorCapabilitiesResponseSchema = z
  .object({
    uptime_only: responseUptimeCapabilitySchema.optional(),
    content_change: responseContentCapabilitySchema.optional(),
    ssl_expiry: responseSslCapabilitySchema.optional(),
    visual_change: responseVisualCapabilitySchema.optional(),
    dns_change: responseDnsCapabilitySchema.optional(),
    ct_log: responseCtCapabilitySchema.optional(),
  })
  .passthrough();

export const monitorResponseSchema = z
  .object({
    id: z.string(),
    displayName: z.string().optional(),
    display_name: z.string().optional(),
    url: z.string(),
    enabledCapabilities: z.array(monitorCapabilityEnum).optional(),
    enabled_capabilities: z.array(monitorCapabilityEnum).optional(),
    capabilities: monitorCapabilitiesResponseSchema.optional(),
    intervalSeconds: z.number().int().optional(),
    interval_seconds: z.number().int().optional(),
    httpMethod: httpMethodSchema.optional(),
    http_method: httpMethodSchema.optional(),
    httpBody: z.string().nullable().optional(),
    http_body: z.string().nullable().optional(),
    httpHeaders: z.record(z.string(), z.string()).nullable().optional(),
    http_headers: z.record(z.string(), z.string()).nullable().optional(),
    httpAuth: httpAuthSummarySchema.optional(),
    http_auth: httpAuthSummarySchema.optional(),
    expectedStatusCode: z.number().int().nullable().optional(),
    expected_status_code: z.number().int().nullable().optional(),
    isEnabled: z.boolean().optional(),
    is_enabled: z.boolean().optional(),
    status: monitorStatusSchema.optional(),
    capabilityStatuses: z.array(capabilityStatusSummarySchema).optional(),
    capability_statuses: z.array(capabilityStatusSummarySchema).optional(),
    lastCheckAt: z.string().nullable().optional(),
    last_check_at: z.string().nullable().optional(),
    lastStatusCode: z.number().int().nullable().optional(),
    last_status_code: z.number().int().nullable().optional(),
    lastResponseTimeMs: z.number().nullable().optional(),
    last_response_time_ms: z.number().nullable().optional(),
    lastChangeDetectedAt: z.string().nullable().optional(),
    last_change_detected_at: z.string().nullable().optional(),
    sslExpiryDays: z.number().int().nullable().optional(),
    ssl_expiry_days: z.number().int().nullable().optional(),
    totalChecks: z.number().int().optional(),
    total_checks: z.number().int().optional(),
    uptimePercentage: z.number().nullable().optional(),
    uptime_percentage: z.number().nullable().optional(),
    avgResponseTimeMs: z.number().nullable().optional(),
    avg_response_time_ms: z.number().nullable().optional(),
    p50ResponseTimeMs: z.number().nullable().optional(),
    p50_response_time_ms: z.number().nullable().optional(),
    p95ResponseTimeMs: z.number().nullable().optional(),
    p95_response_time_ms: z.number().nullable().optional(),
    p99ResponseTimeMs: z.number().nullable().optional(),
    p99_response_time_ms: z.number().nullable().optional(),
    tags: z.array(z.string()).optional(),
    createdAt: z.string().optional(),
    created_at: z.string().optional(),
    updatedAt: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();

export const monitorListMetaSchema = z.object({
  page: z.number().int().min(0),
  limit: z.number().int().min(0),
  total: z.number().int().min(0),
});

export const monitorCheckSchema = z
  .object({
    id: z.string(),
    monitorId: z.string(),
    checkedAt: z.string(),
    success: z.boolean(),
    statusCode: z.number().int().nullable(),
    responseTimeMs: z.number(),
    errorType: checkErrorTypeSchema.nullable(),
    errorMessage: z.string().nullable(),
    contentHash: z.string().nullable(),
    contentChanged: z.boolean(),
    snapshotId: z.string().nullable(),
    sslDaysRemaining: z.number().int().nullable(),
    evaluatedCapabilities: z.array(monitorCapabilityEnum).default([]),
  })
  .passthrough();

export const monitorBaselineSchema = z
  .object({
    snapshotId: z.string(),
    capturedAt: z.string(),
    contentHash: z.string(),
    contentSizeBytes: z.number().int().min(0),
    contentType: z.string().nullable().optional(),
    charset: z.string().nullable().optional(),
    httpStatusCode: z.number().int().nullable().optional(),
    isBaseline: z.boolean().optional(),
  })
  .passthrough();

export const monitorTimeSeriesPointSchema = z
  .object({
    timestamp: z.string(),
    responseTimeMs: z.number().nullable(),
    statusCode: z.number().int().nullable(),
    success: z.boolean(),
  })
  .passthrough();

const monitorTimeSeriesBucketSchema = z
  .object({
    timestamp: z.string(),
    successRate: z.number(),
    avgResponseTime: z.number(),
    minResponseTime: z.number(),
    maxResponseTime: z.number(),
    p50ResponseTime: z.number().optional(),
    p95ResponseTime: z.number().optional(),
    p99ResponseTime: z.number().optional(),
    checkCount: z.number().int().min(0),
  })
  .passthrough();

export const monitorTimeSeriesDataSchema = z
  .object({
    period: periodSchema,
    resolution: z.string(),
    points: z.array(monitorTimeSeriesBucketSchema),
  })
  .passthrough();

/** Endpoint may return either the aggregated object or a flat list of probes. */
export const monitorTimeSeriesPayloadSchema = z.union([
  monitorTimeSeriesDataSchema,
  z.array(monitorTimeSeriesPointSchema),
]);

const monitorCurrentStreakSchema = z.object({
  status: z.string(),
  since: z.string(),
  durationSeconds: z.number().int().min(0),
});

export const monitorUptimeSummarySchema = z
  .object({
    period: periodSchema,
    totalChecks: z.number().int().min(0),
    successfulChecks: z.number().int().min(0),
    failedChecks: z.number().int().min(0).optional(),
    uptimePercentage: z.number(),
    avgResponseTimeMs: z.number(),
    p50ResponseTimeMs: z.number().optional(),
    p95ResponseTimeMs: z.number(),
    p99ResponseTimeMs: z.number().optional(),
    incidents: z.number().int().min(0),
    currentStreak: monitorCurrentStreakSchema.optional(),
    failureDistribution: z.record(z.string(), z.number()).optional(),
  })
  .passthrough();

const monitorChangeDiffSummarySchema = z
  .object({
    linesAdded: z.number().int().min(0),
    linesRemoved: z.number().int().min(0),
    linesChanged: z.number().int().min(0),
    totalDiffLines: z.number().int().min(0).optional(),
    changeCategory: z.enum(["small", "medium", "large"]).optional(),
    diffFingerprint: z.string().optional(),
    previewLine: z.string().optional(),
  })
  .passthrough();

export const monitorChangeSchema = z
  .object({
    id: z.string(),
    monitorId: z.string(),
    detectedAt: z.string(),
    previousSnapshotId: z.string(),
    currentSnapshotId: z.string(),
    linkedVisualCaptureId: z.string().nullable().optional(),
    linkedVisualCorrelation: z.enum(["check_id", "time_window"]).nullable().optional(),
    diffSummary: monitorChangeDiffSummarySchema,
  })
  .passthrough();

export const monitorDiffSchema = z
  .object({
    changeId: z.string(),
    previousContent: z.string(),
    currentContent: z.string(),
    diffHtml: z.string(),
    truncated: z.boolean().optional(),
    originalPreviousLength: z.number().int().min(0).optional(),
    originalCurrentLength: z.number().int().min(0).optional(),
    linkedVisualCaptureId: z.string().nullable().optional(),
    linkedVisualCorrelation: z.enum(["check_id", "time_window"]).nullable().optional(),
  })
  .passthrough();

export const monitorVisualCaptureSchema = z
  .object({
    id: z.string(),
    monitorId: z.string(),
    checkId: z.string().nullable(),
    capturedAt: z.string(),
    widthPx: z.number().int().min(0),
    heightPx: z.number().int().min(0),
    viewportWidth: z.number().int().min(0),
    viewportHeight: z.number().int().min(0),
    fullPage: z.boolean(),
    perceptualHashHex: z.string().nullable(),
    dhashAlgo: z.string(),
  })
  .passthrough();

const monitorVisualChangeDiffSummarySchema = z
  .object({
    hammingDistance: z.number().int().min(0).optional(),
    similarityPercent: z.number().optional(),
    perceptualHashAlgo: z.string().optional(),
    similarityThresholdPercent: z.number().optional(),
  })
  .passthrough();

export const monitorVisualChangeSchema = z
  .object({
    id: z.string(),
    monitorId: z.string(),
    detectedAt: z.string(),
    previousCaptureId: z.string(),
    currentCaptureId: z.string(),
    diffSummary: monitorVisualChangeDiffSummarySchema,
  })
  .passthrough();

export const monitorIncidentSchema = z
  .object({
    id: z.string(),
    monitorId: z.string(),
    capability: monitorCapabilityEnum,
    type: z.enum([
      "downtime",
      "ssl_warning",
      "ssl_critical",
      "content_change",
      "degraded",
    ]),
    startedAt: z.string(),
    resolvedAt: z.string().nullable(),
    durationSeconds: z.number().int().nullable(),
    title: z.string(),
    description: z.string(),
  })
  .passthrough();

const sslChainEntrySchema = z
  .object({
    subject: z.string().optional(),
    subjectDn: z.string().optional(),
    issuer: z.string().optional(),
    issuerDn: z.string().optional(),
    validTo: z.string().optional(),
    validFrom: z.string().optional(),
  })
  .passthrough();

/** Raw shape from `GET /monitors/:id/ssl` — `normalizeMonitorSsl` post-processes. */
export const monitorSslStatusSchema = z
  .object({
    issuer: z.unknown().optional(),
    subject: z.unknown().optional(),
    validFrom: z.unknown().optional(),
    validTo: z.unknown().optional(),
    expiryDate: z.unknown().optional(),
    daysRemaining: z.number().nullable().optional(),
    isExpiringSoon: z.boolean().optional(),
    isExpired: z.boolean().optional(),
    subjectAlternativeNames: z.array(z.unknown()).optional(),
    chainSummary: z.array(sslChainEntrySchema).optional(),
    lastCheckedAt: z.string().nullable().optional(),
    severityLevel: z.string().optional(),
  })
  .passthrough();

/**
 * SSE payload from `/api/v1/monitors/live`. Heartbeats omit `id`; the consumer
 * silently drops anything that doesn't match this shape (must keep the stream
 * open even on a single malformed frame).
 */
export const monitorLiveEventSchema = z
  .object({
    id: z.string().optional(),
    type: z.string().optional(),
    event: z.string().optional(),
  })
  .passthrough();

export type MonitorResponseInput = z.infer<typeof monitorResponseSchema>;
export type MonitorListMetaInput = z.infer<typeof monitorListMetaSchema>;
export type MonitorCheckInput = z.infer<typeof monitorCheckSchema>;
export type MonitorBaselineInput = z.infer<typeof monitorBaselineSchema>;
export type MonitorTimeSeriesDataInput = z.infer<typeof monitorTimeSeriesDataSchema>;
export type MonitorTimeSeriesPayloadInput = z.infer<typeof monitorTimeSeriesPayloadSchema>;
export type MonitorUptimeSummaryInput = z.infer<typeof monitorUptimeSummarySchema>;
export type MonitorChangeInput = z.infer<typeof monitorChangeSchema>;
export type MonitorDiffInput = z.infer<typeof monitorDiffSchema>;
export type MonitorVisualCaptureInput = z.infer<typeof monitorVisualCaptureSchema>;
export type MonitorVisualChangeInput = z.infer<typeof monitorVisualChangeSchema>;
export type MonitorIncidentInput = z.infer<typeof monitorIncidentSchema>;
export type MonitorSslStatusInput = z.infer<typeof monitorSslStatusSchema>;
export type MonitorLiveEventInput = z.infer<typeof monitorLiveEventSchema>;

// ── Phase 1.2: bulk action schemas (must match backend) ──
export const MONITOR_BULK_ACTIONS = [
  "pause",
  "resume",
  "enable",
  "disable",
  "delete",
] as const;
export type MonitorBulkAction = (typeof MONITOR_BULK_ACTIONS)[number];
export const MONITOR_BULK_MAX_IDS = 100;

export const monitorBulkActionRequestSchema = z.object({
  action: z.enum(MONITOR_BULK_ACTIONS),
  monitorIds: z
    .array(z.string().min(1))
    .min(1)
    .max(MONITOR_BULK_MAX_IDS),
});

export const monitorBulkActionFailureSchema = z
  .object({
    monitorId: z.string(),
    errorCode: z.string(),
    message: z.string(),
  })
  .passthrough();

export const monitorBulkActionResponseSchema = z
  .object({
    action: z.enum(MONITOR_BULK_ACTIONS),
    succeeded: z.array(z.string()).default([]),
    failed: z.array(monitorBulkActionFailureSchema).default([]),
    requested: z.number().int().min(0).default(0),
  })
  .passthrough();

export type MonitorBulkActionRequestInput = z.infer<
  typeof monitorBulkActionRequestSchema
>;
export type MonitorBulkActionResponseInput = z.infer<
  typeof monitorBulkActionResponseSchema
>;

// ── Phase 2.2: DNS records / changes ──
export const monitorDnsRecordSchema = z
  .object({
    id: z.string(),
    monitorId: z.string(),
    recordType: dnsRecordTypeEnum,
    values: z.array(z.string()).default([]),
    observedAt: z.string(),
    lastChangeAt: z.string().nullable().optional(),
  })
  .passthrough();

export const monitorDnsChangeSchema = z
  .object({
    id: z.string(),
    monitorId: z.string(),
    recordType: dnsRecordTypeEnum,
    detectedAt: z.string(),
    previousValues: z.array(z.string()).default([]),
    currentValues: z.array(z.string()).default([]),
    addedValues: z.array(z.string()).default([]),
    removedValues: z.array(z.string()).default([]),
  })
  .passthrough();

// ── Phase 2.3: CT log entries ──
export const monitorCtEntrySchema = z
  .object({
    id: z.string(),
    monitorId: z.string(),
    hostname: z.string(),
    serialNumber: z.string(),
    leafSha256: z.string().nullable().optional(),
    issuerName: z.string().nullable().optional(),
    commonName: z.string().nullable().optional(),
    notBefore: z.string().nullable().optional(),
    notAfter: z.string().nullable().optional(),
    observedAt: z.string(),
    crtshId: z.string().nullable().optional(),
    pinViolation: z.boolean().default(false),
    alertedAt: z.string().nullable().optional(),
  })
  .passthrough();

// ── Phase 2.4: maintenance windows ──
export const maintenanceWindowSchema = z
  .object({
    id: z.string(),
    userId: z.number().int(),
    monitorId: z.string().nullable().optional(),
    title: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
    suppressAlerts: z.boolean(),
    suppressProbes: z.boolean(),
    isEnabled: z.boolean(),
    notes: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

export const maintenanceWindowCreateSchema = z.object({
  title: z.string().min(1).max(120),
  monitorId: z.string().nullable().optional(),
  startsAt: z.string(),
  endsAt: z.string(),
  suppressAlerts: z.boolean().optional(),
  suppressProbes: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const maintenanceWindowUpdateSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  monitorId: z.string().nullable().optional(),
  clearMonitorScope: z.boolean().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  suppressAlerts: z.boolean().optional(),
  suppressProbes: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export type MonitorDnsRecordInput = z.infer<typeof monitorDnsRecordSchema>;
export type MonitorDnsChangeInput = z.infer<typeof monitorDnsChangeSchema>;
export type MonitorCtEntryInput = z.infer<typeof monitorCtEntrySchema>;
export type MaintenanceWindowInput = z.infer<typeof maintenanceWindowSchema>;
export type MaintenanceWindowCreateInput = z.infer<
  typeof maintenanceWindowCreateSchema
>;
export type MaintenanceWindowUpdateInput = z.infer<
  typeof maintenanceWindowUpdateSchema
>;
