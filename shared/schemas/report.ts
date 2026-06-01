import { z } from "zod";

import type {
  ReportSchedule,
  ReportScheduleCreateParams,
  ReportScheduleRun,
  ReportScheduleUpdateParams,
} from "../types/report";

export const reportFormatSchema = z.enum(["pdf", "markdown", "html", "both", "all"]);
export const reportPeriodSchema = z.enum(["24h", "7d", "30d", "90d"]);
export const reportScheduleCadenceSchema = z.enum(["weekly", "monthly"]);
export const reportScheduleRunStatusSchema = z.enum([
  "pending",
  "generating",
  "delivering",
  "completed",
  "failed",
]);
export const reportScheduleDeliveryChannelSchema = z.enum(["email", "slack"]);

const isoStringSchema = z.string().min(1);

export const reportScheduleRunSchema = z.object({
  id: z.string(),
  scheduleId: z.string(),
  reportId: z.string().nullable(),
  status: reportScheduleRunStatusSchema,
  startedAt: isoStringSchema.nullable(),
  completedAt: isoStringSchema.nullable(),
  errorMessage: z.string().nullable(),
  deliverySummary: z.record(z.string(), z.unknown()).nullable(),
}) satisfies z.ZodType<ReportScheduleRun>;

export const reportScheduleSchema = z.object({
  id: z.string(),
  userId: z.number().int(),
  name: z.string(),
  scanId: z.string().nullable(),
  monitorId: z.string().nullable(),
  monitorPeriod: reportPeriodSchema.nullable(),
  format: reportFormatSchema,
  cadence: reportScheduleCadenceSchema,
  timezone: z.string(),
  dayOfWeek: z.number().int().min(0).max(6).nullable(),
  dayOfMonth: z.number().int().min(1).max(31).nullable(),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  deliveryChannels: z.array(reportScheduleDeliveryChannelSchema),
  emailRecipients: z.array(z.string()),
  isEnabled: z.boolean(),
  lastRunAt: isoStringSchema.nullable(),
  nextRunAt: isoStringSchema.nullable(),
  createdAt: isoStringSchema,
  updatedAt: isoStringSchema,
  recentRuns: z.array(reportScheduleRunSchema),
}) satisfies z.ZodType<ReportSchedule>;

const reportScheduleInputBaseSchema = z.object({
  name: z.string().trim().min(1).max(160),
  scanId: z.string().min(1),
  monitorId: z.string().min(1).nullable().optional(),
  monitorPeriod: reportPeriodSchema.optional(),
  format: reportFormatSchema.optional(),
  cadence: reportScheduleCadenceSchema,
  timezone: z.string().trim().min(1),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  deliveryChannels: z.array(reportScheduleDeliveryChannelSchema),
  emailRecipients: z.array(z.string().trim().email()).max(20),
  isEnabled: z.boolean().optional(),
});

export const reportScheduleCreateSchema = reportScheduleInputBaseSchema.superRefine(
  (value, ctx) => {
    if (value.cadence === "weekly" && value.dayOfWeek == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dayOfWeek"],
        message: "Weekly schedules need a weekday",
      });
    }
    if (value.cadence === "monthly" && value.dayOfMonth == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dayOfMonth"],
        message: "Monthly schedules need a day of month",
      });
    }
    if (value.deliveryChannels.includes("email") && value.emailRecipients.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["emailRecipients"],
        message: "Email recipients are required when email delivery is enabled",
      });
    }
  },
) satisfies z.ZodType<ReportScheduleCreateParams>;

export const reportScheduleUpdateSchema = reportScheduleInputBaseSchema.partial() satisfies z.ZodType<
  ReportScheduleUpdateParams
>;
