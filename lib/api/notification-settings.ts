import {
  notificationSettingsResponseSchema,
  testNotificationResponseSchema,
  type NotificationSettingsResponse,
} from "@/shared/schemas/notifications";
import type {
  NotificationChannelId,
  NotificationSettings,
  TestEmailResult,
  TestNotificationResult,
} from "@/shared/types/notifications";

import { parseSingle } from "./_validate";
import { apiClient } from "./client";

const TEST_EMAIL_RESPONSE_CONTEXT = "test-email";
const TEST_NOTIFICATION_RESPONSE_CONTEXT = "test-notification";
const NOTIFICATION_SETTINGS_CONTEXT = "notification-settings";

function _normalizeSettings(
  raw: NotificationSettingsResponse,
): NotificationSettings {
  return {
    webhookUrl: raw.webhookUrl,
    webhookEnabled: raw.webhookEnabled,
    monitorEventsEnabled: raw.monitorEventsEnabled,
    emailEnabled: raw.emailEnabled,
    emailAddress: raw.emailAddress,
    emailOnCritical: raw.emailOnCritical,
    emailOnWarning: raw.emailOnWarning,
    emailOnInfo: raw.emailOnInfo,
    channels: raw.channels,
  };
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const { data } = await apiClient.get<unknown>("/me/notification-settings");
  const validated = parseSingle<NotificationSettingsResponse>(
    notificationSettingsResponseSchema,
    data,
    NOTIFICATION_SETTINGS_CONTEXT,
  );
  return _normalizeSettings(validated);
}

export async function updateNotificationSettings(
  body: NotificationSettings,
): Promise<NotificationSettings> {
  const { data } = await apiClient.put<unknown>(
    "/me/notification-settings",
    body,
  );
  const validated = parseSingle<NotificationSettingsResponse>(
    notificationSettingsResponseSchema,
    data,
    NOTIFICATION_SETTINGS_CONTEXT,
  );
  return _normalizeSettings(validated);
}

export async function sendTestEmail(
  emailAddress: string | null,
): Promise<TestEmailResult> {
  const { data } = await apiClient.post<{ sent: boolean; message: string }>(
    "/me/test-email",
    { emailAddress },
  );
  // The legacy test-email endpoint returns a tiny shape — keep it inline so
  // we don't need a dedicated Zod schema just for this response.
  if (
    typeof data?.sent !== "boolean" ||
    typeof data?.message !== "string"
  ) {
    throw new Error(`Invalid ${TEST_EMAIL_RESPONSE_CONTEXT} response`);
  }
  return { sent: data.sent, message: data.message };
}

export async function sendTestNotification(
  channelId: NotificationChannelId,
): Promise<TestNotificationResult> {
  const { data } = await apiClient.post<unknown>(
    "/me/notification-channels/test",
    { channel_id: channelId },
  );
  const parsed = parseSingle<{
    channel_id: string;
    success: boolean;
    message: string;
    latency_ms: number | null;
    error: string | null;
    skipped_reason: string | null;
  }>(
    testNotificationResponseSchema,
    data,
    TEST_NOTIFICATION_RESPONSE_CONTEXT,
  );
  return {
    channelId: parsed.channel_id as NotificationChannelId,
    success: parsed.success,
    message: parsed.message,
    latencyMs: parsed.latency_ms,
    error: parsed.error,
    skippedReason: parsed.skipped_reason,
  };
}

export type { NotificationSettings, TestEmailResult, TestNotificationResult };
