import {
  monitorBaselineSchema,
  monitorBulkActionResponseSchema,
  monitorChangeSchema,
  monitorCheckSchema,
  monitorDiffSchema,
  monitorIncidentSchema,
  monitorListMetaSchema,
  monitorLiveEventSchema,
  monitorResponseSchema,
  monitorSslStatusSchema,
  monitorTimeSeriesPayloadSchema,
  monitorUptimeSummarySchema,
  monitorVisualCaptureSchema,
  monitorVisualChangeSchema,
  type MonitorBulkAction,
  type MonitorBulkActionResponseInput,
} from "@/shared/schemas/monitor";
import { z } from "zod";
import type {
  CheckErrorType,
  Monitor,
  MonitorBaseline,
  MonitorChange,
  MonitorCheck,
  MonitorCreateRequest,
  MonitorDiff,
  MonitorIncident,
  MonitorListMeta,
  MonitorSslStatus,
  MonitorStatus,
  MonitorTimeSeriesData,
  MonitorTimeSeriesPoint,
  MonitorUpdateRequest,
  MonitorUptimeSummary,
  MonitorVisualCapture,
  MonitorVisualChange,
} from "@/shared/types/monitor";
import {
  capabilitiesFromEnabledList,
  mergeCapabilityPatch,
  summarizeCapabilityStatuses,
} from "@/lib/utils/monitor-capabilities";

import { ApiError, apiClient } from "./client";
import { parseList, parseOrThrow, parseSingle } from "./_validate";
import {
  MOCK_MONITORS,
  buildMonitorFromCreateRequest,
  mockChanges,
  mockChecks,
  mockDiff,
  mockListMeta,
  mockSeries,
  mockIncidents,
  mockSsl,
  mockUptimeSummary,
} from "./monitors-mock";

const BASE = "/monitors";

/**
 * Internal narrow that re-types runtime-validated data into the strict shared
 * TypeScript shape. Use ONLY after the value has already been validated by a
 * Zod schema (`parseOrThrow` / `parseSingle` / `parseList`); never on raw
 * `apiClient` payloads. Centralizing the assertion keeps `lib/AGENTS.md` rule
 * #5 honest while avoiding scattered explicit assertions at call sites.
 */
function castValidated<T>(x: unknown): T {
  return x as T;
}

function isMonitorMockMode(): boolean {
  return process.env.NEXT_PUBLIC_MONITOR_USE_MOCK === "1";
}

function normalizeCheck(c: MonitorCheck): MonitorCheck {
  return {
    ...c,
    evaluatedCapabilities: Array.isArray(c.evaluatedCapabilities) ? c.evaluatedCapabilities : [],
  };
}

const CHECK_FIELD_ALIASES: Record<string, string> = {
  monitorId: "monitor_id",
  checkedAt: "checked_at",
  statusCode: "status_code",
  responseTimeMs: "response_time_ms",
  errorType: "error_type",
  errorMessage: "error_message",
  contentHash: "content_hash",
  contentChanged: "content_changed",
  snapshotId: "snapshot_id",
  sslDaysRemaining: "ssl_days_remaining",
  evaluatedCapabilities: "evaluated_capabilities",
};

const CHECK_ERROR_TYPE_ALIASES: Record<string, CheckErrorType> = {
  TIMEOUT: "timeout",
  DNS: "dns_resolution",
  DNS_ERROR: "dns_resolution",
  CONNECTION: "connection_refused",
  CONNECTION_REFUSED: "connection_refused",
  SSL: "ssl_error",
  SSL_ERROR: "ssl_error",
  HTTP: "http_error",
  HTTP_ERROR: "http_error",
  CONTENT_TOO_LARGE: "content_too_large",
  BODY_LIMIT: "content_too_large",
  UNKNOWN: "unknown",
};

function normalizeMonitorCheckWire(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) {
    return raw;
  }
  const out = { ...(raw as Record<string, unknown>) };
  for (const [camel, snake] of Object.entries(CHECK_FIELD_ALIASES)) {
    if (out[camel] === undefined && out[snake] !== undefined) {
      out[camel] = out[snake];
    }
  }
  if (typeof out.errorType === "string") {
    out.errorType = CHECK_ERROR_TYPE_ALIASES[out.errorType] ?? out.errorType;
  }
  return out;
}

const normalizedMonitorCheckSchema = z.preprocess(
  normalizeMonitorCheckWire,
  monitorCheckSchema,
);

function parseMonitorCheck(raw: unknown, context: string): MonitorCheck {
  return parseOrThrow(normalizedMonitorCheckSchema, raw, context);
}

/** Maps common snake_case API keys to camelCase when camelCase is absent (defensive). */
const MONITOR_FIELD_ALIASES: Record<string, string> = {
  isEnabled: "is_enabled",
  displayName: "display_name",
  enabledCapabilities: "enabled_capabilities",
  intervalSeconds: "interval_seconds",
  httpMethod: "http_method",
  expectedStatusCode: "expected_status_code",
  lastCheckAt: "last_check_at",
  lastStatusCode: "last_status_code",
  lastResponseTimeMs: "last_response_time_ms",
  lastChangeDetectedAt: "last_change_detected_at",
  sslExpiryDays: "ssl_expiry_days",
  totalChecks: "total_checks",
  uptimePercentage: "uptime_percentage",
  avgResponseTimeMs: "avg_response_time_ms",
  p50ResponseTimeMs: "p50_response_time_ms",
  p95ResponseTimeMs: "p95_response_time_ms",
  p99ResponseTimeMs: "p99_response_time_ms",
  createdAt: "created_at",
  updatedAt: "updated_at",
  capabilityStatuses: "capability_statuses",
};

function applySnakeCaseAliases(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw };
  for (const [camel, snake] of Object.entries(MONITOR_FIELD_ALIASES)) {
    if (out[camel] === undefined && out[snake] !== undefined) {
      out[camel] = out[snake];
    }
  }
  return out;
}

/** Align isEnabled and status when API mixes snake_case or omits one field. */
function reconcileMonitorEnabledState(m: Record<string, unknown>): void {
  const st = m.status;
  const paused = st === "paused";
  if (paused) {
    m.isEnabled = false;
    return;
  }
  if (m.isEnabled === false) {
    m.status = "paused";
    return;
  }
  if (typeof m.isEnabled !== "boolean") {
    m.isEnabled = true;
  }
}

export function normalizeMonitor(m: unknown): Monitor {
  const raw =
    typeof m === "object" && m !== null ? (m as Record<string, unknown>) : {};
  const merged = applySnakeCaseAliases(raw);
  reconcileMonitorEnabledState(merged);
  const base = castValidated<Monitor>(merged);

  const capabilities =
    base.capabilities ??
    capabilitiesFromEnabledList(
      base.enabledCapabilities?.length ? base.enabledCapabilities : ["uptime_only"]
    );
  const withCaps: Monitor = { ...base, capabilities };
  if (!withCaps.enabledCapabilities?.length) {
    withCaps.enabledCapabilities = ["uptime_only"];
  }
  const finalStatus: MonitorStatus = !withCaps.isEnabled
    ? "paused"
    : (withCaps.status as MonitorStatus);

  return {
    ...withCaps,
    status: finalStatus,
    capabilityStatuses:
      withCaps.capabilityStatuses && withCaps.capabilityStatuses.length > 0
        ? withCaps.capabilityStatuses
        : summarizeCapabilityStatuses({ ...withCaps, status: finalStatus }),
  };
}

function parseMonitor(raw: unknown): Monitor {
  return normalizeMonitor(parseOrThrow(monitorResponseSchema, raw, "monitor"));
}

function readMeta(res: object): MonitorListMeta | undefined {
  if ("meta" in res && res.meta !== undefined && res.meta !== null) {
    const result = monitorListMetaSchema.safeParse(res.meta);
    if (result.success) return result.data;
  }
  return undefined;
}

function readPaginatedPayload(
  res: object,
  context: string,
): { data: unknown; meta?: MonitorListMeta } {
  if ("data" in res && typeof res.data === "object" && res.data !== null) {
    const nested = res.data as object;
    if ("data" in nested) {
      const payload = parseOrThrow(
        z.object({ data: z.unknown() }).passthrough(),
        nested,
        context,
      );
      return { data: payload.data, meta: readMeta(nested) ?? readMeta(res) };
    }
  }

  if ("meta" in res && "data" in res) {
    const meta = readMeta(res);
    const payload = parseOrThrow(
      z.object({ data: z.unknown() }).passthrough(),
      res,
      context,
    );
    return { data: payload.data, meta };
  }
  return {
    data: "data" in res ? (res as { data: unknown }).data : res,
    meta: readMeta(res),
  };
}

export async function listMonitors(
  params?: import("@/shared/types/monitor").MonitorListFilters,
): Promise<{ data: Monitor[]; meta?: MonitorListMeta }> {
  if (isMonitorMockMode()) {
    let rows = [...MOCK_MONITORS];
    if (params?.status) {
      rows = rows.filter((m) => m.status === params.status);
    }
    if (params?.search?.trim()) {
      const q = params.search.toLowerCase();
      rows = rows.filter(
        (m) =>
          m.displayName.toLowerCase().includes(q) || m.url.toLowerCase().includes(q)
      );
    }
    if (params?.tags && params.tags.length > 0) {
      const requested = params.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
      if (requested.length > 0) {
        const all = params.tagMatch === "all";
        rows = rows.filter((m) => {
          const owned = new Set((m.tags ?? []).map((t) => t.toLowerCase()));
          return all
            ? requested.every((t) => owned.has(t))
            : requested.some((t) => owned.has(t));
        });
      }
    }
    if (params?.latencyMaxMs != null) {
      const cap = params.latencyMaxMs;
      rows = rows.filter(
        (m) => m.lastResponseTimeMs != null && m.lastResponseTimeMs <= cap,
      );
    }
    if (params?.uptimeMinPercent != null && params.uptimeMinPercent > 0) {
      const floor = params.uptimeMinPercent;
      rows = rows.filter(
        (m) => m.uptimePercentage != null && m.uptimePercentage >= floor,
      );
    }
    return {
      data: rows.map(normalizeMonitor),
      meta: mockListMeta(rows.length),
    };
  }

  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  if (params?.tags && params.tags.length > 0) {
    const seen = new Set<string>();
    for (const raw of params.tags) {
      const t = raw.trim().toLowerCase();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      query.append("tags", t);
    }
    if (params.tagMatch === "all") {
      query.set("tag_match", "all");
    }
  }
  if (params?.latencyMaxMs != null) {
    query.set("latency_max_ms", String(params.latencyMaxMs));
  }
  if (params?.uptimeMinPercent != null) {
    query.set("uptime_min_percent", String(params.uptimeMinPercent));
  }
  if (params?.sort) {
    query.set("sort", `${params.sort.field}:${params.sort.direction}`);
  }
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  const res = await apiClient.get<unknown>(`${BASE}?${query}`);
  const list = parseList<unknown>(monitorResponseSchema, res.data, "monitor list");
  return {
    data: list.map(normalizeMonitor),
    meta: readMeta(res as object),
  };
}

export async function getMonitor(id: string): Promise<Monitor> {
  if (isMonitorMockMode()) {
    const m = MOCK_MONITORS.find((x) => x.id === id);
    if (!m) throw new Error("Monitor not found");
    return normalizeMonitor(m);
  }
  const { data } = await apiClient.get<unknown>(`${BASE}/${id}`);
  return parseMonitor(data);
}

export async function createMonitor(data: MonitorCreateRequest): Promise<Monitor> {
  if (isMonitorMockMode()) {
    const m = buildMonitorFromCreateRequest(data);
    MOCK_MONITORS.unshift(m);
    return m;
  }
  const { data: created } = await apiClient.post<unknown>(BASE, data);
  return parseMonitor(created);
}

export async function updateMonitor(
  id: string,
  data: MonitorUpdateRequest
): Promise<Monitor> {
  if (isMonitorMockMode()) {
    const idx = MOCK_MONITORS.findIndex((x) => x.id === id);
    if (idx < 0) throw new Error("Monitor not found");
    const prev = MOCK_MONITORS[idx]!;
    const next: Monitor = { ...prev, updatedAt: new Date().toISOString() };
    if (data.displayName !== undefined) next.displayName = data.displayName;
    if (data.url !== undefined) next.url = data.url;
    if (data.intervalSeconds !== undefined) next.intervalSeconds = data.intervalSeconds;
    if (data.httpMethod !== undefined) next.httpMethod = data.httpMethod;
    if (data.expectedStatusCode !== undefined) next.expectedStatusCode = data.expectedStatusCode;
    if (data.tags !== undefined) next.tags = data.tags;
    if (data.isEnabled !== undefined) {
      next.isEnabled = data.isEnabled;
      if (!data.isEnabled) {
        next.status = "paused";
      } else if (prev.status === "paused") {
        next.status = "pending";
      }
    }
    if (data.enabledCapabilities !== undefined) {
      next.enabledCapabilities = data.enabledCapabilities;
      next.capabilities = capabilitiesFromEnabledList(data.enabledCapabilities);
    }
    if (data.capabilities) {
      next.capabilities = mergeCapabilityPatch(next.capabilities, data.capabilities);
    }
    next.capabilityStatuses = summarizeCapabilityStatuses(next);
    MOCK_MONITORS[idx] = normalizeMonitor(next);
    return MOCK_MONITORS[idx]!;
  }
  const { data: updated } = await apiClient.put<unknown>(`${BASE}/${id}`, data);
  return parseMonitor(updated);
}

export async function deleteMonitor(id: string): Promise<void> {
  if (isMonitorMockMode()) {
    const idx = MOCK_MONITORS.findIndex((x) => x.id === id);
    if (idx >= 0) MOCK_MONITORS.splice(idx, 1);
    return;
  }
  await apiClient.delete(`${BASE}/${id}`);
}

/** POST /monitors/bulk — apply `action` to many monitors at once. */
export async function bulkActOnMonitors(
  action: MonitorBulkAction,
  monitorIds: string[],
): Promise<MonitorBulkActionResponseInput> {
  const ids = Array.from(new Set(monitorIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) {
    return { action, succeeded: [], failed: [], requested: 0 };
  }
  if (isMonitorMockMode()) {
    const succeeded: string[] = [];
    const failed: { monitorId: string; errorCode: string; message: string }[] = [];
    for (const id of ids) {
      const idx = MOCK_MONITORS.findIndex((x) => x.id === id);
      if (idx < 0) {
        failed.push({ monitorId: id, errorCode: "MONITOR_NOT_FOUND", message: "Monitor not found" });
        continue;
      }
      const cur = MOCK_MONITORS[idx]!;
      switch (action) {
        case "pause":
        case "disable":
          MOCK_MONITORS[idx] = { ...cur, isEnabled: false, status: "paused" };
          break;
        case "resume":
        case "enable":
          MOCK_MONITORS[idx] = {
            ...cur,
            isEnabled: true,
            status: cur.status === "paused" ? "pending" : cur.status,
          };
          break;
        case "delete":
          MOCK_MONITORS.splice(idx, 1);
          break;
      }
      succeeded.push(id);
    }
    return { action, succeeded, failed, requested: ids.length };
  }
  const { data } = await apiClient.post<unknown>(
    `${BASE}/bulk`,
    { action, monitorIds: ids },
  );
  return parseSingle<MonitorBulkActionResponseInput>(
    monitorBulkActionResponseSchema,
    data,
    "monitor bulk action",
  );
}

export async function toggleMonitor(id: string, enabled: boolean): Promise<Monitor> {
  return updateMonitor(id, { isEnabled: enabled });
}

export async function triggerCheck(id: string): Promise<MonitorCheck> {
  if (isMonitorMockMode()) {
    const m = MOCK_MONITORS.find((x) => x.id === id);
    if (!m) throw new Error("Monitor not found");
    return mockChecks(id)[0]!;
  }
  const { data } = await apiClient.post<unknown>(`${BASE}/${id}/check`);
  return normalizeCheck(parseMonitorCheck(data, "monitor check"));
}

/**
 * GET /monitors/:id/checks — query params mirror backend: `period`, `success`, `sort`, `page`, `limit`.
 * Time filtering is via `period` (24h|7d|30d|90d), not arbitrary from/to timestamps.
 */
export async function getMonitorChecks(
  id: string,
  params?: {
    page?: number;
    limit?: number;
    period?: "24h" | "7d" | "30d" | "90d";
    success?: boolean;
    sort?: "asc" | "desc";
  }
): Promise<{ data: MonitorCheck[]; meta?: MonitorListMeta }> {
  if (isMonitorMockMode()) {
    const rows = mockChecks(id);
    return { data: rows.map(normalizeCheck), meta: mockListMeta(rows.length) };
  }
  const query = new URLSearchParams();
  if (params?.period) query.set("period", params.period);
  if (params?.success !== undefined) query.set("success", String(params.success));
  if (params?.sort) query.set("sort", params.sort);
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  const res = await apiClient.get<unknown>(`${BASE}/${id}/checks?${query}`);
  const payload = readPaginatedPayload(res as object, "monitor check list");
  const rows = parseList<MonitorCheck>(
    normalizedMonitorCheckSchema,
    payload.data,
    "monitor check list",
  );
  return {
    data: rows.map(normalizeCheck),
    meta: payload.meta,
  };
}

export async function getMonitorContentBaseline(
  id: string
): Promise<MonitorBaseline | null> {
  if (isMonitorMockMode()) {
    const rows = mockChecks(id).map(normalizeCheck);
    const withHash = rows.find((c) => c.contentHash);
    if (!withHash?.contentHash) return null;
    return {
      snapshotId: withHash.snapshotId ?? "mock-snapshot",
      capturedAt: withHash.checkedAt,
      contentHash: withHash.contentHash,
      contentSizeBytes: 0,
      isBaseline: true,
    };
  }
  const { data } = await apiClient.get<unknown>(`${BASE}/${id}/content/baseline`);
  if (data === null || data === undefined) return null;
  return parseSingle<MonitorBaseline>(monitorBaselineSchema, data, "monitor baseline");
}

function normalizeSeriesPayload(
  period: "24h" | "7d" | "30d" | "90d",
  raw: MonitorTimeSeriesData | MonitorTimeSeriesPoint[]
): MonitorTimeSeriesData {
  if (Array.isArray(raw)) {
    return {
      period,
      resolution: "sample",
      points: raw.map((p) => ({
        timestamp: p.timestamp,
        successRate: p.success ? 100 : 0,
        avgResponseTime: p.responseTimeMs ?? 0,
        minResponseTime: p.responseTimeMs ?? 0,
        maxResponseTime: p.responseTimeMs ?? 0,
        checkCount: 1,
      })),
    };
  }
  return {
    ...raw,
    period: raw.period ?? period,
    resolution: raw.resolution ?? "",
    points: Array.isArray(raw.points) ? raw.points : [],
  };
}

export async function getMonitorTimeSeries(
  id: string,
  period: "24h" | "7d" | "30d" | "90d"
): Promise<MonitorTimeSeriesData> {
  if (isMonitorMockMode()) {
    return normalizeSeriesPayload(period, mockSeries(period));
  }
  const { data } = await apiClient.get<unknown>(`${BASE}/${id}/series?period=${period}`);
  const parsed = parseSingle<MonitorTimeSeriesData | MonitorTimeSeriesPoint[]>(
    monitorTimeSeriesPayloadSchema,
    data,
    "monitor time series",
  );
  return normalizeSeriesPayload(period, parsed);
}

export async function getMonitorUptimeSummary(
  id: string,
  period: "24h" | "7d" | "30d" | "90d"
): Promise<MonitorUptimeSummary> {
  if (isMonitorMockMode()) return mockUptimeSummary(period);
  const { data } = await apiClient.get<unknown>(`${BASE}/${id}/uptime?period=${period}`);
  return parseSingle<MonitorUptimeSummary>(
    monitorUptimeSummarySchema,
    data,
    "monitor uptime summary",
  );
}

export async function getMonitorChanges(
  id: string,
  params?: {
    page?: number;
    limit?: number;
    period?: "24h" | "7d" | "30d" | "90d";
    category?: "small" | "medium" | "large";
    sort?: "asc" | "desc";
  }
): Promise<{ data: MonitorChange[]; meta?: MonitorListMeta }> {
  if (isMonitorMockMode()) {
    let all = mockChanges(id);
    if (params?.category) {
      all = all.filter((c) => c.diffSummary.changeCategory === params.category);
    }
    const limit = Math.min(params?.limit ?? 20, 100);
    const page = params?.page ?? 1;
    const start = (page - 1) * limit;
    const rows = all.slice(start, start + limit);
    return {
      data: rows,
      meta: { page, limit, total: all.length },
    };
  }
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.period) query.set("period", params.period);
  if (params?.category) query.set("category", params.category);
  if (params?.sort) query.set("sort", params.sort);
  const res = await apiClient.get<unknown>(`${BASE}/${id}/changes?${query}`);
  const rows = parseList<MonitorChange>(monitorChangeSchema, res.data, "monitor change list");
  return {
    data: rows,
    meta: readMeta(res as object),
  };
}

/** Same-origin path for <img src>; includes /api/v1 for Next rewrite to backend. */
export function monitorVisualCapturePngUrl(monitorId: string, captureId: string): string {
  return `/api/v1/monitors/${monitorId}/visual/captures/${captureId}/png`;
}

export async function getMonitorVisualCaptures(
  id: string,
  params?: {
    page?: number;
    limit?: number;
    period?: "24h" | "7d" | "30d" | "90d";
    sort?: "asc" | "desc";
  }
): Promise<{ data: MonitorVisualCapture[]; meta?: MonitorListMeta }> {
  if (isMonitorMockMode()) {
    return { data: [], meta: { page: 1, limit: 20, total: 0 } };
  }
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.period) query.set("period", params.period);
  if (params?.sort) query.set("sort", params.sort);
  const res = await apiClient.get<unknown>(`${BASE}/${id}/visual/captures?${query}`);
  const rows = parseList<MonitorVisualCapture>(
    monitorVisualCaptureSchema,
    res.data,
    "monitor visual captures",
  );
  return { data: rows, meta: readMeta(res as object) };
}

/**
 * V-2: synchronously trigger a screenshot capture for a monitor. Rate-limited
 * server-side (default 5 / minute / monitor); callers should surface the
 * error message from the mutation result rather than retry blindly.
 */
export async function triggerMonitorVisualCaptureNow(
  id: string,
): Promise<MonitorVisualCapture> {
  if (isMonitorMockMode()) {
    throw new Error("Mock mode does not support capture-now");
  }
  const { data } = await apiClient.post<unknown>(
    `${BASE}/${id}/visual/captures/now`,
  );
  return parseSingle<MonitorVisualCapture>(
    monitorVisualCaptureSchema,
    data,
    "monitor visual capture now",
  );
}

export async function getMonitorVisualChanges(
  id: string,
  params?: {
    page?: number;
    limit?: number;
    period?: "24h" | "7d" | "30d" | "90d";
    sort?: "asc" | "desc";
  }
): Promise<{ data: MonitorVisualChange[]; meta?: MonitorListMeta }> {
  if (isMonitorMockMode()) {
    return { data: [], meta: { page: 1, limit: 20, total: 0 } };
  }
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.period) query.set("period", params.period);
  if (params?.sort) query.set("sort", params.sort);
  const res = await apiClient.get<unknown>(`${BASE}/${id}/visual/changes?${query}`);
  const rows = parseList<MonitorVisualChange>(
    monitorVisualChangeSchema,
    res.data,
    "monitor visual changes",
  );
  return { data: rows, meta: readMeta(res as object) };
}

export async function getMonitorDiff(
  monitorId: string,
  changeId: string,
  options?: { diff?: "line" | "word" },
): Promise<MonitorDiff> {
  if (isMonitorMockMode()) {
    const known = mockChanges(monitorId).some((c) => c.id === changeId);
    if (!known) {
      throw new ApiError("Change not found", {
        status: 404,
        code: "CHANGE_NOT_FOUND",
      });
    }
    return mockDiff(changeId);
  }
  const { data } = await apiClient.get<unknown>(
    `${BASE}/${monitorId}/changes/${changeId}/diff${options?.diff === "word" ? "?diff=word" : ""}`,
    { timeout: 180_000 }
  );
  return parseSingle<MonitorDiff>(monitorDiffSchema, data, "monitor diff");
}

export async function getMonitorIncidents(
  id: string,
  params?: { page?: number; limit?: number }
): Promise<{ data: MonitorIncident[]; meta?: MonitorListMeta }> {
  if (isMonitorMockMode()) {
    const rows = mockIncidents(id, params?.limit);
    return { data: rows, meta: mockListMeta(rows.length) };
  }
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  const res = await apiClient.get<unknown>(`${BASE}/${id}/incidents?${query}`);
  const rows = parseList<MonitorIncident>(monitorIncidentSchema, res.data, "monitor incidents");
  return {
    data: rows,
    meta: readMeta(res as object),
  };
}

function normalizeMonitorSsl(raw: Record<string, unknown>): MonitorSslStatus {
  const sevRaw = String(raw.severityLevel ?? "unknown").toLowerCase();
  let severityLevel: MonitorSslStatus["severityLevel"];
  if (sevRaw === "warning" || sevRaw === "warn") severityLevel = "warn";
  else if (sevRaw === "ok") severityLevel = "ok";
  else if (sevRaw === "critical") severityLevel = "critical";
  else if (sevRaw === "expired") severityLevel = "expired";
  else severityLevel = "unknown";

  const chains = Array.isArray(raw.chainSummary) ? raw.chainSummary : [];
  const chainSummary = chains.map((entry) => {
    const c = entry as Record<string, unknown>;
    return {
      subject: String(c.subject ?? c.subjectDn ?? ""),
      issuer: String(c.issuer ?? c.issuerDn ?? ""),
      validTo: String(c.validTo ?? ""),
      validFrom: c.validFrom != null ? String(c.validFrom) : undefined,
    };
  });

  const daysRaw = raw.daysRemaining;
  const daysRemaining =
    typeof daysRaw === "number" && !Number.isNaN(daysRaw) ? daysRaw : null;

  const lastRaw = raw.lastCheckedAt;
  const lastCheckedAt = lastRaw == null || lastRaw === "" ? null : String(lastRaw);

  const sans = raw.subjectAlternativeNames;
  const subjectAlternativeNames = Array.isArray(sans)
    ? sans.map((x) => String(x))
    : [];

  return {
    issuer: raw.issuer != null ? String(raw.issuer) : "",
    subject: raw.subject != null ? String(raw.subject) : "",
    validFrom: String(raw.validFrom ?? ""),
    validTo: String(raw.validTo ?? raw.expiryDate ?? ""),
    daysRemaining,
    isExpiringSoon: Boolean(raw.isExpiringSoon),
    isExpired: Boolean(raw.isExpired),
    subjectAlternativeNames,
    chainSummary,
    lastCheckedAt,
    severityLevel,
  };
}

export async function getMonitorSsl(id: string): Promise<MonitorSslStatus> {
  if (isMonitorMockMode()) return mockSsl();
  const { data } = await apiClient.get<unknown>(`${BASE}/${id}/ssl`);
  const parsed = parseOrThrow(
    monitorSslStatusSchema,
    data ?? {},
    "monitor ssl status"
  );
  return normalizeMonitorSsl(parsed as Record<string, unknown>);
}

export function subscribeMonitorUpdates(
  onUpdate: (payload: { id: string; event?: string }) => void
): EventSource {
  const es = new EventSource("/api/v1/monitors/live", { withCredentials: true });
  es.onmessage = (event) => {
    let raw: unknown;
    try {
      raw = JSON.parse(event.data);
    } catch (err) {
      // Malformed JSON frame: drop silently to keep stream alive.
      void err;
      return;
    }
    const result = monitorLiveEventSchema.safeParse(raw);
    if (!result.success) {
      return;
    }
    const payload = result.data;
    if (payload.type === "heartbeat" || !payload.id) return;
    onUpdate({ id: payload.id, event: payload.event });
  };
  return es;
}
