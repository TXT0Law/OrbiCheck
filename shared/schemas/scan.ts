import { z } from "zod";

// === Request schemas ===

export const ScanCreateSchema = z.object({
  url: z.string().min(1, "URL is required").transform((val) => {
    const trimmed = val.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      return `https://${trimmed}`;
    }
    return trimmed;
  }),
  modules: z.array(z.string()).optional(),
  enablePortScan: z.boolean().default(false),
  portScanProfile: z.enum(["quick", "standard", "deep"]).default("quick"),
  acknowledgeScanAuthorization: z.boolean().default(false),
});

export type ScanCreateInput = z.infer<typeof ScanCreateSchema>;

// === Response validation schemas ===
// Lightweight — only validate structure, not every field

export const ApiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    status: z.literal("success"),
    data: dataSchema,
    meta: z.record(z.string(), z.unknown()).optional(),
  });

export const ApiErrorSchema = z.object({
  status: z.literal("error"),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export const ScanResponseSchema = z.object({
  id: z.string(),
  url: z.string(),
  domain: z.string(),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled"]),
  progress: z.number(),
  totalModules: z.number().optional(),
  completedModules: z.number().optional(),
  securityScore: z.number().nullable().optional(),
  createdAt: z.string().optional(),
  total_modules: z.number().optional(),
  completed_modules: z.number().optional(),
  security_score: z.number().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  started_at: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
}).passthrough();

export const ScanListSchema = z.object({
  scans: z.array(ScanResponseSchema),
  total: z.number(),
});

export const ScanProgressEventSchema = z.object({
  progress: z.number(),
  phase: z.string(),
  detail: z.string(),
  completedModules: z.number(),
  totalModules: z.number(),
  done: z.boolean().optional(),
});

const severityCountsSchema = z.object({
  critical: z.number(),
  high: z.number(),
  medium: z.number(),
  low: z.number(),
});

const categoryScoresSchema = z.object({
  transport: z.number(),
  httpSecurity: z.number(),
  threatIntel: z.number(),
  infrastructure: z.number(),
  bestPractices: z.number(),
});

export const ScanDetailResponseSchema = z.object({
  id: z.string(),
  domain: z.string(),
  url: z.string(),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled"]),
  scannedAt: z.string().nullable(),
  duration: z.string().nullable(),
  securityScore: z.number().nullable(),
  severity: severityCountsSchema,
  categorySummary: z.array(z.unknown()),
  keyFindings: z.array(z.unknown()),
  moduleErrors: z.record(z.string(), z.unknown()),
}).passthrough();

export const ScanFullExportSchema = z.record(z.string(), z.unknown());

export const ScanTimelineResponseSchema = z.object({
  domain: z.string(),
  points: z.array(z.object({
    scanId: z.string(),
    completedAt: z.string().nullable(),
    securityScore: z.number().nullable(),
    severity: severityCountsSchema,
  })),
});

const findingDeltaSchema = z.object({
  title: z.string(),
  severity: z.string(),
  module: z.string().nullable(),
  description: z.string().nullable(),
});

const severityDeltaSchema = z.object({
  base: severityCountsSchema,
  compare: severityCountsSchema,
  delta: severityCountsSchema,
});

export const ScanDiffResponseSchema = z.object({
  baseScanId: z.string(),
  compareScanId: z.string(),
  baseDomain: z.string(),
  compareDomain: z.string(),
  baseCompletedAt: z.string().nullable(),
  compareCompletedAt: z.string().nullable(),
  baseScore: z.number().nullable(),
  compareScore: z.number().nullable(),
  addedFindings: z.array(findingDeltaSchema),
  removedFindings: z.array(findingDeltaSchema),
  severityDelta: severityDeltaSchema,
  breakdownDelta: z.object({
    base: categoryScoresSchema.nullable(),
    compare: categoryScoresSchema.nullable(),
    delta: categoryScoresSchema.nullable(),
  }),
});

export const ModuleRetryResponseSchema = z.object({
  module: z.string(),
  status: z.enum(["success", "failed", "timed-out"]),
  durationMs: z.number(),
  error: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const DeletedScansResponseSchema = z.object({
  deleted: z.number().int().min(0),
});
