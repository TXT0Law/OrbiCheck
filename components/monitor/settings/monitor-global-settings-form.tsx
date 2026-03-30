"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { ApiError } from "@/lib/api/client";
import { useTriggerCheck, useUpdateMonitor } from "@/lib/hooks/use-monitors";
import { monitorCreateSchema } from "@/shared/schemas/monitor";
import type { Monitor, MonitorHttpMethod, MonitorUpdateRequest } from "@/shared/types/monitor";

import { MonitorIntervalSelect } from "../monitor-interval-select";
import { MonitorCapabilityToggleGroup } from "./monitor-capability-toggle-group";
import { MonitorSettingsPreview } from "./monitor-settings-preview";

function tagsEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x === b[i]);
}

function capabilityListsEqual(
  a: Monitor["enabledCapabilities"],
  b: Monitor["enabledCapabilities"]
) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((x, i) => x === sb[i]);
}

function readValidationIssue(error: unknown): { fieldPath: string; message: string } | null {
  if (!(error instanceof ApiError) || !Array.isArray(error.details) || error.details.length === 0) {
    return null;
  }
  const issue = error.details[0] as { loc?: unknown[]; msg?: unknown };
  const path = Array.isArray(issue.loc)
    ? issue.loc
        .filter((part) => part !== "body")
        .map((part) => String(part))
        .join(".")
    : "";
  const message = typeof issue.msg === "string" ? issue.msg : error.message;
  return {
    fieldPath: path,
    message: path ? `${path}: ${message}` : message,
  };
}

interface MonitorGlobalSettingsFormProps {
  monitor: Monitor;
}

export function MonitorGlobalSettingsForm({ monitor }: MonitorGlobalSettingsFormProps) {
  const update = useUpdateMonitor(monitor.id);
  const triggerCheck = useTriggerCheck(monitor.id);
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(monitor.displayName);
  const [url, setUrl] = useState(monitor.url);
  const [enabledCapabilities, setEnabledCapabilities] = useState(monitor.enabledCapabilities);
  const [intervalSeconds, setIntervalSeconds] = useState(monitor.intervalSeconds);
  const [httpMethod, setHttpMethod] = useState<MonitorHttpMethod>(monitor.httpMethod);
  const [expectedStatus, setExpectedStatus] = useState(
    monitor.expectedStatusCode != null ? String(monitor.expectedStatusCode) : ""
  );
  const [tagsRaw, setTagsRaw] = useState(monitor.tags.join(", "));
  const [isEnabled, setIsEnabled] = useState(monitor.isEnabled);
  const [formError, setFormError] = useState<string | null>(null);
  const [capError, setCapError] = useState<string | undefined>();
  const [checkAfterSave, setCheckAfterSave] = useState(false);

  const pendingChanges: MonitorUpdateRequest = useMemo(() => {
    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const nextExpected = expectedStatus.trim() === "" ? null : Number(expectedStatus);
    const out: MonitorUpdateRequest = {};
    if (displayName !== monitor.displayName) out.displayName = displayName;
    if (url !== monitor.url) out.url = url;
    if (!capabilityListsEqual(enabledCapabilities, monitor.enabledCapabilities)) {
      out.enabledCapabilities = enabledCapabilities;
    }
    if (intervalSeconds !== monitor.intervalSeconds) out.intervalSeconds = intervalSeconds;
    if (httpMethod !== monitor.httpMethod) out.httpMethod = httpMethod;
    if (nextExpected !== monitor.expectedStatusCode) {
      out.expectedStatusCode = nextExpected;
    }
    if (!tagsEqual(tags, monitor.tags)) out.tags = tags;
    if (isEnabled !== monitor.isEnabled) out.isEnabled = isEnabled;
    return out;
  }, [
    displayName,
    url,
    enabledCapabilities,
    intervalSeconds,
    httpMethod,
    expectedStatus,
    tagsRaw,
    isEnabled,
    monitor,
  ]);

  useEffect(() => {
    setDisplayName(monitor.displayName);
    setUrl(monitor.url);
    setEnabledCapabilities(monitor.enabledCapabilities);
    setIntervalSeconds(monitor.intervalSeconds);
    setHttpMethod(monitor.httpMethod);
    setExpectedStatus(
      monitor.expectedStatusCode != null ? String(monitor.expectedStatusCode) : ""
    );
    setTagsRaw(monitor.tags.join(", "));
    setIsEnabled(monitor.isEnabled);
  }, [monitor]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setCapError(undefined);
    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const parsed = monitorCreateSchema.safeParse({
      displayName,
      url,
      enabledCapabilities,
      intervalSeconds,
      httpMethod,
      expectedStatusCode: expectedStatus.trim() === "" ? null : Number(expectedStatus),
      tags,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.path.join(".") === "enabledCapabilities") {
        setCapError(issue.message);
      }
      setFormError(issue?.message ?? "Invalid form");
      return;
    }
    const payload = {
      displayName: parsed.data.displayName,
      url: parsed.data.url,
      enabledCapabilities: parsed.data.enabledCapabilities,
      intervalSeconds: parsed.data.intervalSeconds,
      httpMethod: parsed.data.httpMethod,
      expectedStatusCode: parsed.data.expectedStatusCode,
      tags: parsed.data.tags,
      isEnabled,
    };
    try {
      await update.mutateAsync(payload);
      toast({ title: "Settings saved" });
      if (checkAfterSave) {
        try {
          await triggerCheck.mutateAsync();
          toast({
            title: "Check triggered",
            description: "A check has been queued with the new settings.",
          });
        } catch {
          toast({
            title: "Check trigger failed",
            description: "Settings were saved but the check could not be triggered.",
            variant: "destructive",
          });
        }
      }
    } catch (err) {
      const validationIssue = readValidationIssue(err);
      if (validationIssue?.fieldPath === "enabledCapabilities") {
        setCapError(validationIssue.message);
      }
      const message =
        validationIssue?.message ?? (err instanceof Error ? err.message : "Update failed");
      setFormError(message);
      toast({
        title: "Save failed",
        description: message,
        variant: "destructive",
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
      <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Global</h3>
      {formError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {formError}
        </div>
      ) : null}

      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-sm font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-100">
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={(e) => setIsEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-400 dark:border-zinc-500"
        />
        Monitoring enabled
      </label>

      <div className="space-y-2">
        <label htmlFor="g-name" className="text-sm font-medium text-zinc-900 dark:text-white">
          Display name
        </label>
        <Input id="g-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      </div>

      <div className="space-y-2">
        <label htmlFor="g-url" className="text-sm font-medium text-zinc-900 dark:text-white">
          URL
        </label>
        <Input id="g-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} required />
      </div>

      <MonitorCapabilityToggleGroup
        value={enabledCapabilities}
        onChange={(v) => {
          setEnabledCapabilities(v);
          setCapError(undefined);
        }}
        error={capError}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <span className="text-sm font-medium text-zinc-900 dark:text-white">Interval</span>
          <MonitorIntervalSelect value={intervalSeconds} onChange={setIntervalSeconds} />
        </div>
        <div className="space-y-2">
          <label htmlFor="g-method" className="text-sm font-medium text-zinc-900 dark:text-white">
            HTTP method
          </label>
          <select
            id="g-method"
            value={httpMethod}
            onChange={(e) => setHttpMethod(e.target.value as MonitorHttpMethod)}
            className="flex min-h-11 w-full rounded-md border-2 border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="GET">GET</option>
            <option value="HEAD">HEAD</option>
            <option value="POST">POST</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="g-expected" className="text-sm font-medium text-zinc-900 dark:text-white">
          Expected status code (optional)
        </label>
        <Input
          id="g-expected"
          inputMode="numeric"
          value={expectedStatus}
          onChange={(e) => setExpectedStatus(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="g-tags" className="text-sm font-medium text-zinc-900 dark:text-white">
          Tags (comma-separated)
        </label>
        <Input id="g-tags" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} />
      </div>

      <MonitorSettingsPreview
        pendingChanges={pendingChanges}
        checkAfterSave={checkAfterSave}
        onCheckAfterSaveChange={setCheckAfterSave}
      />

      <Button type="submit" disabled={update.isPending}>
        {update.isPending ? "Saving…" : "Save global settings"}
      </Button>
    </form>
  );
}
