"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useMonitorDetail } from "@/components/monitor/monitor-detail-context";
import { ApiError } from "@/lib/api/client";
import { useUpdateMonitor } from "@/lib/hooks/use-monitors";
import type {
  MonitorCapability,
  PerCapabilityConfig,
} from "@/shared/types/monitor";

import { MonitorContentThresholdsForm } from "./monitor-content-thresholds-form";
import { MonitorCtLogThresholdsForm } from "./monitor-ct-log-thresholds-form";
import { MonitorDnsThresholdsForm } from "./monitor-dns-thresholds-form";
import { MonitorSslThresholdsForm } from "./monitor-ssl-thresholds-form";
import { MonitorUptimeThresholdsForm } from "./monitor-uptime-thresholds-form";
import { MonitorVisualThresholdsForm } from "./monitor-visual-thresholds-form";

interface MonitorCapabilitySettingsFormProps {
  monitorId: string;
  capability: MonitorCapability;
  config: PerCapabilityConfig;
}

function readValidationMessage(error: unknown): string {
  if (error instanceof ApiError && Array.isArray(error.details) && error.details.length > 0) {
    const issue = error.details[0] as { loc?: unknown[]; msg?: unknown };
    const path = Array.isArray(issue.loc)
      ? issue.loc
          .filter((part) => part !== "body")
          .map((part) => String(part))
          .join(".")
      : "";
    const message = typeof issue.msg === "string" ? issue.msg : error.message;
    return path ? `${path}: ${message}` : message;
  }
  return error instanceof Error ? error.message : "Save failed";
}

export function MonitorCapabilitySettingsForm({
  monitorId,
  capability,
  config,
}: MonitorCapabilitySettingsFormProps) {
  const { monitor } = useMonitorDetail();
  const update = useUpdateMonitor(monitorId);
  const { toast } = useToast();
  const [alertEnabled, setAlertEnabled] = useState(config.alert.enabled);
  const [cooldown, setCooldown] = useState(config.alert.cooldownSeconds);
  const [thresholds, setThresholds] = useState(config.thresholds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = monitor.capabilities[capability];
    setAlertEnabled(c.alert.enabled);
    setCooldown(c.alert.cooldownSeconds);
    setThresholds(c.thresholds);
  }, [monitor, capability]);

  const capEnabled = monitor.enabledCapabilities.includes(capability);

  async function toggleEnabled(on: boolean) {
    setError(null);
    const setCaps = new Set(monitor.enabledCapabilities);
    if (on) {
      setCaps.add(capability);
    } else {
      setCaps.delete(capability);
    }
    const list = Array.from(setCaps) as import("@/shared/types/monitor").MonitorCapability[];
    if (list.length < 1) {
      setError("At least one capability must stay enabled.");
      return;
    }
    try {
      await update.mutateAsync({ enabledCapabilities: list });
      toast({ title: "Capability updated" });
    } catch (e) {
      const message = readValidationMessage(e);
      setError(message);
      toast({
        title: "Capability update failed",
        description: message,
        variant: "destructive",
      });
    }
  }

  async function saveThresholds() {
    setSaving(true);
    setError(null);
    try {
      await update.mutateAsync({
        capabilities: {
          [capability]: {
            ...monitor.capabilities[capability],
            alert: {
              ...monitor.capabilities[capability].alert,
              enabled: alertEnabled,
              cooldownSeconds: cooldown,
            },
            thresholds,
          },
        },
      });
      toast({ title: "Capability settings saved" });
    } catch (e) {
      const message = readValidationMessage(e);
      setError(message);
      toast({
        title: "Capability settings failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 py-2">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <label className="flex cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={capEnabled}
          onChange={(e) => toggleEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-400"
        />
        <span className="font-medium text-zinc-900 dark:text-white">Enable this capability</span>
      </label>

      <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm font-medium text-zinc-900 dark:text-white">Alerts</p>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-900 dark:text-zinc-100">
          <input
            type="checkbox"
            checked={alertEnabled}
            onChange={(e) => setAlertEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-400 dark:border-zinc-500"
          />
          Alerts enabled
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-zinc-900 dark:text-zinc-100">
          <span className="font-medium">Cooldown (seconds)</span>
          <input
            type="number"
            min={0}
            max={86400}
            value={cooldown}
            onChange={(e) => setCooldown(Number(e.target.value) || 0)}
            className="rounded-md border-2 border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-zinc-900 dark:text-white">Thresholds</p>
        {capability === "uptime_only" ? (
          <MonitorUptimeThresholdsForm
            value={thresholds as never}
            onChange={setThresholds as never}
          />
        ) : null}
        {capability === "content_change" ? (
          <MonitorContentThresholdsForm
            value={thresholds as never}
            onChange={setThresholds as never}
          />
        ) : null}
        {capability === "ssl_expiry" ? (
          <MonitorSslThresholdsForm value={thresholds as never} onChange={setThresholds as never} />
        ) : null}
        {capability === "visual_change" ? (
          <MonitorVisualThresholdsForm
            value={thresholds as never}
            onChange={setThresholds as never}
          />
        ) : null}
        {capability === "dns_change" ? (
          <MonitorDnsThresholdsForm
            value={thresholds as never}
            onChange={setThresholds as never}
          />
        ) : null}
        {capability === "ct_log" ? (
          <MonitorCtLogThresholdsForm
            value={thresholds as never}
            onChange={setThresholds as never}
          />
        ) : null}
      </div>

      <Button
        type="button"
        onClick={() => saveThresholds()}
        disabled={saving || update.isPending || !capEnabled}
      >
        {saving || update.isPending ? "Saving…" : "Save capability settings"}
      </Button>
    </div>
  );
}
