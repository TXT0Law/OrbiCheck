"use client";

import { useMemo, useState } from "react";

import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { ApiError } from "@/lib/api/client";
import { sendTestNotification } from "@/lib/api/notification-settings";
import { validateChannelTarget } from "@/shared/schemas/notifications";
import type {
  ChannelConfig,
  NotificationChannelId,
  NotificationSeverity,
  Phase3ChannelId,
} from "@/shared/types/notifications";

const ALL_SEVERITIES: NotificationSeverity[] = ["critical", "warning", "info"];

interface ChannelMeta {
  id: Phase3ChannelId;
  label: string;
  description: string;
  targetLabel: string;
  targetPlaceholder: string;
  targetIsSecret: boolean;
}

const CHANNEL_META: Record<Phase3ChannelId, ChannelMeta> = {
  slack: {
    id: "slack",
    label: "Slack",
    description:
      "POST a Block Kit message to a Slack incoming webhook. URL must start with https://hooks.slack.com/.",
    targetLabel: "Slack webhook URL",
    targetPlaceholder: "https://hooks.slack.com/services/T000/B000/XXXX",
    targetIsSecret: false,
  },
  discord: {
    id: "discord",
    label: "Discord",
    description:
      "POST a rich embed to a Discord webhook (https://discord.com/api/webhooks/...).",
    targetLabel: "Discord webhook URL",
    targetPlaceholder:
      "https://discord.com/api/webhooks/<id>/<token>",
    targetIsSecret: false,
  },
  teams: {
    id: "teams",
    label: "Microsoft Teams",
    description:
      "POST an Adaptive Card to a Teams incoming webhook (legacy connector). URL must point at *.webhook.office.com/.",
    targetLabel: "Teams webhook URL",
    targetPlaceholder:
      "https://example.webhook.office.com/webhookb2/...",
    targetIsSecret: false,
  },
  pagerduty: {
    id: "pagerduty",
    label: "PagerDuty",
    description:
      "Send incidents through the PagerDuty Events API v2. Trigger / resolve events share the same dedup key so recoveries auto-close the open incident.",
    targetLabel: "PagerDuty integration key",
    targetPlaceholder: "Routing key from a PagerDuty service integration",
    targetIsSecret: true,
  },
};

interface NotificationChannelFormProps {
  channelId: Phase3ChannelId;
  config: ChannelConfig;
  onChange: (next: ChannelConfig) => void;
}

export function NotificationChannelForm({
  channelId,
  config,
  onChange,
}: NotificationChannelFormProps) {
  const meta = CHANNEL_META[channelId];
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);

  const targetError = useMemo(() => {
    if (!config.enabled) return null;
    if (!config.target || !config.target.trim()) return "Required";
    return validateChannelTarget(channelId, config.target);
  }, [channelId, config.enabled, config.target]);

  function _toggleSeverity(sev: NotificationSeverity) {
    const next = config.severityFilter.includes(sev)
      ? config.severityFilter.filter((s) => s !== sev)
      : [...config.severityFilter, sev];
    if (next.length === 0) {
      // At least one severity must remain selected; UI guard so we don't
      // render an unconfigurable filter chip.
      return;
    }
    onChange({ ...config, severityFilter: next });
  }

  async function _onTest() {
    setTesting(true);
    try {
      const id: NotificationChannelId = channelId;
      const result = await sendTestNotification(id);
      toast({
        title: result.success ? "Test sent" : "Test failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    } catch (e) {
      toast({
        title: "Test failed",
        description: e instanceof ApiError ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {meta.label}
        </p>
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-zinc-400"
          checked={config.enabled}
          onChange={(e) =>
            onChange({ ...config, enabled: e.target.checked })
          }
          aria-label={`Enable ${meta.label}`}
        />
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          Enable {meta.label}
        </span>
      </label>

      <div className="space-y-2">
        <label
          htmlFor={`${channelId}-target`}
          className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
        >
          {meta.targetLabel}
        </label>
        <input
          id={`${channelId}-target`}
          type={meta.targetIsSecret ? "password" : "url"}
          autoComplete="off"
          placeholder={meta.targetPlaceholder}
          value={config.target ?? ""}
          onChange={(e) =>
            onChange({
              ...config,
              target: e.target.value,
            })
          }
          disabled={!config.enabled}
          className="w-full rounded-md border-2 border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />
        {targetError ? (
          <p className="text-xs text-red-600 dark:text-red-400">{targetError}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Severities to forward
        </p>
        <div className="flex flex-wrap gap-2">
          {ALL_SEVERITIES.map((sev) => {
            const checked = config.severityFilter.includes(sev);
            return (
              <label
                key={sev}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${
                  checked
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={checked}
                  disabled={!config.enabled}
                  onChange={() => _toggleSeverity(sev)}
                  aria-label={`Forward ${sev} alerts to ${meta.label}`}
                />
                <span className="font-medium uppercase">{sev}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void _onTest()}
          disabled={!config.enabled || testing || Boolean(targetError)}
        >
          {testing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending test…
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Send test alert
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
