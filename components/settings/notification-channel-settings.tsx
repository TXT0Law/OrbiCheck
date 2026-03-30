"use client";

import { useEffect, useState } from "react";

import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  getNotificationSettings,
  sendTestEmail,
  updateNotificationSettings,
  type NotificationSettings,
} from "@/lib/api/notification-settings";
import { ApiError } from "@/lib/api/client";

export function NotificationChannelSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [monitorEventsEnabled, setMonitorEventsEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [emailOnCritical, setEmailOnCritical] = useState(true);
  const [emailOnWarning, setEmailOnWarning] = useState(true);
  const [emailOnInfo, setEmailOnInfo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getNotificationSettings();
        if (cancelled) return;
        setWebhookUrl(s.webhookUrl ?? "");
        setWebhookEnabled(s.webhookEnabled);
        setMonitorEventsEnabled(s.monitorEventsEnabled);
        setEmailEnabled(s.emailEnabled);
        setEmailAddress(s.emailAddress ?? "");
        setEmailOnCritical(s.emailOnCritical);
        setEmailOnWarning(s.emailOnWarning);
        setEmailOnInfo(s.emailOnInfo);
      } catch (e) {
        if (!cancelled) {
          toast({
            title: "Failed to load notification settings",
            description: e instanceof ApiError ? e.message : "Unknown error",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  async function onSave() {
    if (emailEnabled && emailAddress.trim() === "") {
      toast({
        title: "Email address is required",
        description: "Provide a destination email before enabling email notifications.",
        variant: "destructive",
      });
      return;
    }

    if (emailEnabled && !emailOnCritical && !emailOnWarning && !emailOnInfo) {
      toast({
        title: "Select at least one severity",
        description: "Choose at least one severity level for email notifications.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const body: NotificationSettings = {
      webhookUrl: webhookUrl.trim() === "" ? null : webhookUrl.trim(),
      webhookEnabled,
      monitorEventsEnabled,
      emailEnabled,
      emailAddress: emailAddress.trim() === "" ? null : emailAddress.trim(),
      emailOnCritical,
      emailOnWarning,
      emailOnInfo,
    };
    try {
      const saved = await updateNotificationSettings(body);
      setWebhookUrl(saved.webhookUrl ?? "");
      setWebhookEnabled(saved.webhookEnabled);
      setMonitorEventsEnabled(saved.monitorEventsEnabled);
      setEmailEnabled(saved.emailEnabled);
      setEmailAddress(saved.emailAddress ?? "");
      setEmailOnCritical(saved.emailOnCritical);
      setEmailOnWarning(saved.emailOnWarning);
      setEmailOnInfo(saved.emailOnInfo);
      toast({ title: "Notification settings saved" });
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof ApiError ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function onSendTestEmail() {
    setSendingTestEmail(true);
    try {
      const result = await sendTestEmail(emailAddress.trim() || null);
      toast({
        title: result.sent ? "Test email sent" : "Test email failed",
        description: result.message,
        variant: result.sent ? "default" : "destructive",
      });
    } catch (e) {
      toast({
        title: "Test email failed",
        description: e instanceof ApiError ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSendingTestEmail(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Notifications
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Send monitor events (checks, content changes, SSL thresholds, visual
          changes) to your HTTPS webhook. Per-monitor alerts must stay enabled in
          each monitor&apos;s capability settings.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-400"
            checked={monitorEventsEnabled}
            onChange={(e) => setMonitorEventsEnabled(e.target.checked)}
          />
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            Forward monitor events to webhook
          </span>
        </label>

        <div className="space-y-2">
          <label
            htmlFor="notification-webhook-url"
            className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
          >
            Webhook URL
          </label>
          <input
            id="notification-webhook-url"
            type="url"
            placeholder="https://hooks.example.com/orbicheck"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            className="w-full rounded-md border-2 border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <p className="text-xs text-muted-foreground">
            POST JSON: source, monitorId, event, data. Use HTTPS in production.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-400"
            checked={webhookEnabled}
            onChange={(e) => setWebhookEnabled(e.target.checked)}
          />
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            Webhook delivery enabled
          </span>
        </label>
      </div>

      <div className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-400"
            checked={emailEnabled}
            onChange={(e) => setEmailEnabled(e.target.checked)}
          />
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            Email notifications enabled
          </span>
        </label>

        <div className="space-y-2">
          <label
            htmlFor="notification-email-address"
            className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
          >
            Email address
          </label>
          <input
            id="notification-email-address"
            type="email"
            placeholder="alerts@example.com"
            value={emailAddress}
            onChange={(e) => setEmailAddress(e.target.value)}
            disabled={!emailEnabled}
            className="w-full rounded-md border-2 border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <p className="text-xs text-muted-foreground">
            Critical and warning alerts can be delivered by email in addition to webhook.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Send email for</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-400"
              checked={emailOnCritical}
              disabled={!emailEnabled}
              onChange={(e) => setEmailOnCritical(e.target.checked)}
            />
            <span className="inline-flex h-2 w-2 rounded-full bg-red-500" aria-hidden />
            <span className="font-medium text-zinc-900 dark:text-zinc-100">Critical alerts</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-400"
              checked={emailOnWarning}
              disabled={!emailEnabled}
              onChange={(e) => setEmailOnWarning(e.target.checked)}
            />
            <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" aria-hidden />
            <span className="font-medium text-zinc-900 dark:text-zinc-100">Warning alerts</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-400"
              checked={emailOnInfo}
              disabled={!emailEnabled}
              onChange={(e) => setEmailOnInfo(e.target.checked)}
            />
            <span className="inline-flex h-2 w-2 rounded-full bg-sky-500" aria-hidden />
            <span className="font-medium text-zinc-900 dark:text-zinc-100">Info alerts</span>
          </label>
        </div>

        <div className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void onSendTestEmail()}
            disabled={!emailEnabled || emailAddress.trim() === "" || sendingTestEmail}
          >
            {sendingTestEmail ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending test email...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send test email
              </>
            )}
          </Button>
        </div>
      </div>

      <Button type="button" onClick={() => void onSave()} disabled={saving}>
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving…
          </>
        ) : (
          "Save notification settings"
        )}
      </Button>
    </div>
  );
}
