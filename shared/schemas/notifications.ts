import { z } from "zod";

import {
  NOTIFICATION_CHANNEL_IDS,
  NOTIFICATION_SEVERITIES,
  PHASE3_CHANNEL_IDS,
} from "../types/notifications";

// ── Validation patterns enforced at the boundary ──
//
// Mirrors the backend regex / host whitelists in
// ``backend/app/services/notification_channels/{slack,discord,teams,pagerduty}.py``.
// Keeping these in shared schemas means the form can fail-fast before the
// HTTP roundtrip and the wire response can be re-validated on the way back.

const SLACK_WEBHOOK_PATTERN = /^https:\/\/hooks\.slack\.com\/.+/;
const DISCORD_WEBHOOK_PATTERN =
  /^https:\/\/(?:ptb\.|canary\.)?(?:discord(?:app)?\.com)\/api\/webhooks\/.+/;
const TEAMS_WEBHOOK_PATTERN = /^https:\/\/[A-Za-z0-9.-]+\.webhook\.office\.com\/.+/;
const PAGERDUTY_KEY_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

const severitySchema = z.enum([
  NOTIFICATION_SEVERITIES[0],
  NOTIFICATION_SEVERITIES[1],
  NOTIFICATION_SEVERITIES[2],
]);

const channelIdSchema = z.enum([
  NOTIFICATION_CHANNEL_IDS[0],
  NOTIFICATION_CHANNEL_IDS[1],
  NOTIFICATION_CHANNEL_IDS[2],
  NOTIFICATION_CHANNEL_IDS[3],
  NOTIFICATION_CHANNEL_IDS[4],
  NOTIFICATION_CHANNEL_IDS[5],
]);

const channelConfigBaseSchema = z.object({
  enabled: z.boolean(),
  target: z.string().nullable(),
  severityFilter: z.array(severitySchema).min(1).max(3),
});

export const channelConfigResponseSchema = channelConfigBaseSchema;

export const channelConfigInputSchema = channelConfigBaseSchema.extend({
  target: z.string().nullable().optional(),
});

export const notificationSettingsResponseSchema = z.object({
  webhookUrl: z.string().nullable(),
  webhookEnabled: z.boolean(),
  monitorEventsEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  emailAddress: z.string().nullable(),
  emailOnCritical: z.boolean(),
  emailOnWarning: z.boolean(),
  emailOnInfo: z.boolean(),
  channels: z.object({
    slack: channelConfigResponseSchema,
    discord: channelConfigResponseSchema,
    teams: channelConfigResponseSchema,
    pagerduty: channelConfigResponseSchema,
  }),
});

export const testNotificationRequestSchema = z.object({
  channelId: channelIdSchema,
});

export const testNotificationResponseSchema = z.object({
  channel_id: channelIdSchema,
  success: z.boolean(),
  message: z.string(),
  latency_ms: z.number().int().nullable(),
  error: z.string().nullable(),
  skipped_reason: z.string().nullable(),
});

export const notificationSettingsUpdateSchema = z.object({
  webhookUrl: z.string().nullable().optional(),
  webhookEnabled: z.boolean(),
  monitorEventsEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  emailAddress: z.string().nullable().optional(),
  emailOnCritical: z.boolean(),
  emailOnWarning: z.boolean(),
  emailOnInfo: z.boolean(),
  channels: z.object({
    slack: channelConfigInputSchema,
    discord: channelConfigInputSchema,
    teams: channelConfigInputSchema,
    pagerduty: channelConfigInputSchema,
  }),
});

export const PHASE3_CHANNEL_PATTERNS: Record<
  (typeof PHASE3_CHANNEL_IDS)[number],
  RegExp
> = {
  slack: SLACK_WEBHOOK_PATTERN,
  discord: DISCORD_WEBHOOK_PATTERN,
  teams: TEAMS_WEBHOOK_PATTERN,
  pagerduty: PAGERDUTY_KEY_PATTERN,
};

export function validateChannelTarget(
  channelId: (typeof PHASE3_CHANNEL_IDS)[number],
  value: string,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Required";
  const pattern = PHASE3_CHANNEL_PATTERNS[channelId];
  if (!pattern.test(trimmed)) {
    if (channelId === "pagerduty") {
      return "Integration key must be 20-128 chars (letters/digits/_/-)";
    }
    if (channelId === "slack") {
      return "URL must start with https://hooks.slack.com/";
    }
    if (channelId === "discord") {
      return "URL must be a Discord webhook (https://discord.com/api/webhooks/...)";
    }
    if (channelId === "teams") {
      return "URL must point to https://*.webhook.office.com/";
    }
  }
  return null;
}

export type NotificationSettingsResponse = z.infer<
  typeof notificationSettingsResponseSchema
>;
export type NotificationSettingsUpdateInput = z.infer<
  typeof notificationSettingsUpdateSchema
>;
export type TestNotificationResponse = z.infer<
  typeof testNotificationResponseSchema
>;
