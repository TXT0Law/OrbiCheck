"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateMonitor } from "@/lib/hooks/use-monitors";
import { monitorCreateSchema } from "@/shared/schemas/monitor";
import type { MonitorCreateRequest, MonitorHttpMethod } from "@/shared/types/monitor";

import { MonitorCapabilityToggleGroup } from "./settings/monitor-capability-toggle-group";
import { MonitorIntervalSelect } from "./monitor-interval-select";

export function MonitorCreateForm() {
  const router = useRouter();
  const create = useCreateMonitor();
  const [displayName, setDisplayName] = useState("");
  const [url, setUrl] = useState("");
  const [enabledCapabilities, setEnabledCapabilities] = useState<
    import("@/shared/types/monitor").MonitorCapability[]
  >(["uptime_only"]);
  const [intervalSeconds, setIntervalSeconds] = useState(60);
  const [httpMethod, setHttpMethod] = useState<MonitorHttpMethod>("GET");
  const [expectedStatus, setExpectedStatus] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [capError, setCapError] = useState<string | undefined>();

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
    try {
      const mon = await create.mutateAsync(parsed.data as MonitorCreateRequest);
      router.push(`/dashboard/monitor/${mon.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-6">
      {formError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {formError}
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="m-name" className="text-sm font-medium text-zinc-900 dark:text-white">
          Display name
        </label>
        <Input
          id="m-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="m-url" className="text-sm font-medium text-zinc-900 dark:text-white">
          URL
        </label>
        <Input
          id="m-url"
          type="url"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
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
          <label htmlFor="m-interval" className="text-sm font-medium text-zinc-900 dark:text-white">
            Interval
          </label>
          <MonitorIntervalSelect value={intervalSeconds} onChange={setIntervalSeconds} />
        </div>
        <div className="space-y-2">
          <label htmlFor="m-method" className="text-sm font-medium text-zinc-900 dark:text-white">
            HTTP method
          </label>
          <select
            id="m-method"
            value={httpMethod}
            onChange={(e) => setHttpMethod(e.target.value as MonitorHttpMethod)}
            className="flex min-h-11 w-full rounded-md border-2 border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="GET">GET</option>
            <option value="HEAD">HEAD</option>
            <option value="POST">POST</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="m-expected" className="text-sm font-medium text-zinc-900 dark:text-white">
          Expected status code (optional)
        </label>
        <Input
          id="m-expected"
          inputMode="numeric"
          placeholder="Leave empty to accept any 2xx–3xx"
          value={expectedStatus}
          onChange={(e) => setExpectedStatus(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="m-tags" className="text-sm font-medium text-zinc-900 dark:text-white">
          Tags (comma-separated)
        </label>
        <Input
          id="m-tags"
          value={tagsRaw}
          onChange={(e) => setTagsRaw(e.target.value)}
          placeholder="production, blog"
        />
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button type="submit" size="lg" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create monitor"}
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
