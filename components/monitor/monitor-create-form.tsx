"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateMonitor } from "@/lib/hooks/use-monitors";
import { monitorCreateSchema } from "@/shared/schemas/monitor";
import {
  MONITOR_HTTP_BODY_BEARING_METHODS,
  MONITOR_HTTP_MAX_BODY_BYTES,
  MONITOR_HTTP_MAX_HEADERS_COUNT,
  type HttpAuthScheme,
  type MonitorCreateRequest,
  type MonitorHttpMethod,
} from "@/shared/types/monitor";

import { MonitorCapabilityToggleGroup } from "./settings/monitor-capability-toggle-group";
import { MonitorIntervalSelect } from "./monitor-interval-select";

const REQUEST_HTTP_METHODS: MonitorHttpMethod[] = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
];

const HTTP_BODY_BEARING_METHODS = new Set<MonitorHttpMethod>(
  MONITOR_HTTP_BODY_BEARING_METHODS,
);

interface HeaderRow {
  /** Stable per-row key so React reconciles edits to the same input. */
  id: string;
  name: string;
  value: string;
}

function makeHeaderRow(): HeaderRow {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: "",
    value: "",
  };
}

function rowsToRecord(rows: HeaderRow[]): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    out[name] = row.value;
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

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

  // Phase 1.1 — Advanced HTTP settings.
  const [httpBody, setHttpBody] = useState("");
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>([makeHeaderRow()]);
  const [authScheme, setAuthScheme] = useState<HttpAuthScheme>("none");
  // `authToken` is a write-only input. We deliberately never echo back any
  // value coming from the server; on update flows the user is asked to
  // re-enter a token if they wish to rotate it.
  const [authToken, setAuthToken] = useState("");

  const bodySupported = HTTP_BODY_BEARING_METHODS.has(httpMethod);
  const bodyByteLength = bodySupported ? new TextEncoder().encode(httpBody).length : 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setCapError(undefined);
    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const headers = rowsToRecord(headerRows);
    const httpAuth =
      authScheme === "none"
        ? undefined
        : { scheme: authScheme, token: authToken === "" ? null : authToken };
    const parsed = monitorCreateSchema.safeParse({
      displayName,
      url,
      enabledCapabilities,
      intervalSeconds,
      httpMethod,
      httpBody: bodySupported && httpBody.length > 0 ? httpBody : undefined,
      httpHeaders: headers,
      httpAuth,
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
            {REQUEST_HTTP_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
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

      <details
        className="group rounded-md border-2 border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50"
        data-testid="monitor-advanced-http"
      >
        <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Advanced HTTP settings
        </summary>
        <div className="mt-4 space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="m-body"
              className="text-sm font-medium text-zinc-900 dark:text-white"
            >
              Request body
              <span className="ml-2 text-xs font-normal text-zinc-500">
                {bodySupported
                  ? `${bodyByteLength.toLocaleString()} / ${MONITOR_HTTP_MAX_BODY_BYTES.toLocaleString()} bytes`
                  : `Disabled for ${httpMethod}`}
              </span>
            </label>
            <textarea
              id="m-body"
              data-testid="m-body"
              value={httpBody}
              disabled={!bodySupported}
              onChange={(e) => setHttpBody(e.target.value)}
              rows={4}
              placeholder={
                bodySupported
                  ? '{"hello": "world"}'
                  : "Switch to POST/PUT/PATCH to send a body"
              }
              className="block w-full rounded-md border-2 border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-900 dark:text-white">
                Custom headers
                <span className="ml-2 text-xs font-normal text-zinc-500">
                  {headerRows.filter((row) => row.name.trim()).length}/
                  {MONITOR_HTTP_MAX_HEADERS_COUNT}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={headerRows.length >= MONITOR_HTTP_MAX_HEADERS_COUNT}
                onClick={() =>
                  setHeaderRows((rows) => [...rows, makeHeaderRow()])
                }
              >
                Add header
              </Button>
            </div>
            <div className="space-y-2">
              {headerRows.map((row, idx) => (
                <div key={row.id} className="flex gap-2">
                  <Input
                    aria-label={`Header name ${idx + 1}`}
                    placeholder="X-API-Key"
                    value={row.name}
                    onChange={(e) =>
                      setHeaderRows((rows) =>
                        rows.map((r) =>
                          r.id === row.id ? { ...r, name: e.target.value } : r,
                        ),
                      )
                    }
                  />
                  <Input
                    aria-label={`Header value ${idx + 1}`}
                    placeholder="Value"
                    value={row.value}
                    onChange={(e) =>
                      setHeaderRows((rows) =>
                        rows.map((r) =>
                          r.id === row.id ? { ...r, value: e.target.value } : r,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setHeaderRows((rows) =>
                        rows.length === 1
                          ? [makeHeaderRow()]
                          : rows.filter((r) => r.id !== row.id),
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="m-auth-scheme"
                className="text-sm font-medium text-zinc-900 dark:text-white"
              >
                Authentication
              </label>
              <select
                id="m-auth-scheme"
                value={authScheme}
                onChange={(e) => {
                  const next = e.target.value as HttpAuthScheme;
                  setAuthScheme(next);
                  if (next === "none") setAuthToken("");
                }}
                className="flex min-h-11 w-full rounded-md border-2 border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="none">None</option>
                <option value="bearer">Bearer token</option>
                <option value="basic">Basic (user:password)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="m-auth-token"
                className="text-sm font-medium text-zinc-900 dark:text-white"
              >
                Token
                <span className="ml-2 text-xs font-normal text-zinc-500">
                  Stored encrypted; never displayed again
                </span>
              </label>
              <Input
                id="m-auth-token"
                data-testid="m-auth-token"
                type="password"
                autoComplete="new-password"
                disabled={authScheme === "none"}
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder={
                  authScheme === "basic" ? "user:password" : "ey..."
                }
              />
            </div>
          </div>
        </div>
      </details>

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
