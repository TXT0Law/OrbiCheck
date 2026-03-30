import { z } from "zod";

import { MONITOR_INTERVALS, MONITOR_CAPABILITIES } from "../types/monitor";

const monitorCapabilityEnum = z.enum([
  MONITOR_CAPABILITIES[0],
  MONITOR_CAPABILITIES[1],
  MONITOR_CAPABILITIES[2],
  MONITOR_CAPABILITIES[3],
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

export const monitorCapabilitiesSchema = z.object({
  uptime_only: uptimeCapabilitySchema.optional(),
  content_change: contentCapabilitySchema.optional(),
  ssl_expiry: sslCapabilitySchema.optional(),
  visual_change: visualCapabilitySchema.optional(),
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
  httpMethod: z.enum(["GET", "HEAD", "POST"]).default("GET"),
  expectedStatusCode: z.number().int().min(100).max(599).nullable().default(null),
  tags: z.array(z.string().max(50)).max(10).default([]),
});

export const monitorUpdateSchema = monitorCreateSchema.partial().extend({
  isEnabled: z.boolean().optional(),
});

export type MonitorCreateInput = z.infer<typeof monitorCreateSchema>;
export type MonitorUpdateInput = z.infer<typeof monitorUpdateSchema>;
