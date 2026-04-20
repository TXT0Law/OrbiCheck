import { z } from "zod";

import {
  monitorBaselineSchema,
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
} from "@/shared/schemas/monitor";
import type {
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

const INVALID_RESPONSE_STATUS = 502;
const INVALID_RESPONSE_CODE = "INVALID_RESPONSE_SHAPE";

/**
 * Parse `data` against `schema` and throw a structured `ApiError` on failure.
 * Centralizes boundary validation so every endpoint surfaces the same error
 * code (`INVALID_RESPONSE_SHAPE`) and the React Query layer can render a
 * consistent toast instead of letting `NaN` / `undefined` leak into UI state.
 */
function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(`Invalid ${context} response from server`, {
      status: INVALID_RESPONSE_STATUS,
      code: INVALID_RESPONSE_CODE,
      details: result.error.issues,
    });
  }
  return result.data;
}

/**
 * Validate a single object payload then re-narrow to the strict shared
 * TypeScript type. Zod's inferred type tolerates passthrough keys; the strict
 * `T` parameter lets callers stay typed without sprinkling explicit `as`
 * assertions throughout the API client (which would defeat the boundary
 * validation contract in `lib/AGENTS.md`).
 */
function parseSingle<T>(
  schema: z.ZodTypeAny,
  raw: unknown,
  context: string,
): T {
  const validated = parseOrThrow(schema as z.ZodType<unknown>, raw, context);
  return validated as unknown as T;
}

function parseList<T>(
  itemSchema: z.ZodTypeAny,
  raw: unknown,
  context: string,
): T[] {
  const validated = parseOrThrow(
    z.array(itemSchema as z.ZodType<unknown>),
    raw,
    context,
  );
  return validated as unknown as T[];
}

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

export async function listMonitors(params?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: Monitor[]; meta?: MonitorListMeta }> {
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
    return {
      data: rows.map(normalizeMonitor),
      meta: mockListMeta(rows.length),
    };
  }

  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
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
  return normalizeCheck(parseSingle<MonitorCheck>(monitorCheckSchema, data, "monitor check"));
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
  const rows = parseList<MonitorCheck>(monitorCheckSchema, res.data, "monitor check list");
  return {
    data: rows.map(normalizeCheck),
    meta: readMeta(res as object),
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
  changeId: string
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
    `${BASE}/${monitorId}/changes/${changeId}/diff`,
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
