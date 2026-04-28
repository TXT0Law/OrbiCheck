// ============================================================
// Notification Channels — Shared Type Definitions (Phase 3)
// ============================================================

export const PHASE3_CHANNEL_IDS = [
  "slack",
  "discord",
  "teams",
  "pagerduty",
] as const;
export type Phase3ChannelId = (typeof PHASE3_CHANNEL_IDS)[number];

export const NOTIFICATION_CHANNEL_IDS = [
  "webhook",
  "email",
  ...PHASE3_CHANNEL_IDS,
] as const;
export type NotificationChannelId = (typeof NOTIFICATION_CHANNEL_IDS)[number];

export const NOTIFICATION_SEVERITIES = [
  "critical",
  "warning",
  "info",
] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export interface ChannelConfig {
  enabled: boolean;
  target: string | null;
  severityFilter: NotificationSeverity[];
}

export interface NotificationSettings {
  webhookUrl: string | null;
  webhookEnabled: boolean;
  monitorEventsEnabled: boolean;
  emailEnabled: boolean;
  emailAddress: string | null;
  emailOnCritical: boolean;
  emailOnWarning: boolean;
  emailOnInfo: boolean;
  channels: Record<Phase3ChannelId, ChannelConfig>;
}

export interface TestEmailResult {
  sent: boolean;
  message: string;
}

export interface TestNotificationResult {
  channelId: NotificationChannelId;
  success: boolean;
  message: string;
  latencyMs: number | null;
  error: string | null;
  skippedReason: string | null;
}
