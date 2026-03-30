# User Settings

Current user preferences and notification configuration. Settings are stored in Redis.

## GET /me/notification-settings

Get notification settings for the current user.

**Response:** `SuccessResponse[NotificationSettingsResponse]`

---

## PUT /me/notification-settings

Update notification settings (webhook URLs, email preferences, etc.).

**Request body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `webhookUrl` | string | No | — | Webhook endpoint URL |
| `webhookEnabled` | bool | No | `false` | Enable webhook delivery |
| `monitorEventsEnabled` | bool | No | `true` | Include monitor events in notifications |
| `emailEnabled` | bool | No | `false` | Enable email notifications (requires SMTP config) |
| `emailAddress` | string | No | — | Recipient email address |
| `emailOnCritical` | bool | No | `true` | Send email on critical alerts |
| `emailOnWarning` | bool | No | `true` | Send email on warning alerts |
| `emailOnInfo` | bool | No | `false` | Send email on info-level alerts |

**Response:** `SuccessResponse[NotificationSettingsResponse]`

---

## POST /me/test-email

Send a test email to verify SMTP configuration.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | string | Yes | Recipient email address |

**Response:** `SuccessResponse[TestEmailResponse]`

**Errors:** Returns error if SMTP is not configured or email dispatch is disabled.
