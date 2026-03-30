import { apiClient } from "./client";

export interface NotificationSettings {
  webhookUrl: string | null;
  webhookEnabled: boolean;
  monitorEventsEnabled: boolean;
  emailEnabled: boolean;
  emailAddress: string | null;
  emailOnCritical: boolean;
  emailOnWarning: boolean;
  emailOnInfo: boolean;
}

export interface TestEmailResult {
  sent: boolean;
  message: string;
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const { data } = await apiClient.get<NotificationSettings>("/me/notification-settings");
  return data;
}

export async function updateNotificationSettings(
  body: NotificationSettings
): Promise<NotificationSettings> {
  const { data } = await apiClient.put<NotificationSettings>(
    "/me/notification-settings",
    body
  );
  return data;
}

export async function sendTestEmail(
  emailAddress: string | null
): Promise<TestEmailResult> {
  const { data } = await apiClient.post<TestEmailResult>("/me/test-email", {
    emailAddress,
  });
  return data;
}
