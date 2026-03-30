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
  totalModules: z.number(),
  completedModules: z.number(),
  securityScore: z.number().nullable(),
  createdAt: z.string(),
});

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
