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

export function normalizeMonitor(m: Monitor | Record<string, unknown>): Monitor {
  const raw =
    typeof m === "object" && m !== null ? (m as Record<string, unknown>) : {};
  const merged = applySnakeCaseAliases(raw);
  reconcileMonitorEnabledState(merged);
  const base = merged as unknown as Monitor;

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

function readMeta(res: object): MonitorListMeta | undefined {
  if ("meta" in res && res.meta && typeof res.meta === "object") {
    return res.meta as MonitorListMeta;
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
  const res = await apiClient.get<Monitor[]>(`${BASE}?${query}`);
  return {
    data: (res.data as Monitor[]).map(normalizeMonitor),
    meta: readMeta(res as object),
  };
}

export async function getMonitor(id: string): Promise<Monitor> {
  if (isMonitorMockMode()) {
    const m = MOCK_MONITORS.find((x) => x.id === id);
    if (!m) throw new Error("Monitor not found");
    return normalizeMonitor(m);
  }
  const { data } = await apiClient.get<Monitor>(`${BASE}/${id}`);
  return normalizeMonitor(data as Monitor);
}

export async function createMonitor(data: MonitorCreateRequest): Promise<Monitor> {
  if (isMonitorMockMode()) {
    const m = buildMonitorFromCreateRequest(data);
    MOCK_MONITORS.unshift(m);
    return m;
  }
  const { data: created } = await apiClient.post<Monitor>(BASE, data);
  return normalizeMonitor(created as Monitor);
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
  const { data: updated } = await apiClient.put<Monitor>(`${BASE}/${id}`, data);
  return normalizeMonitor(updated as Monitor);
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
  const { data } = await apiClient.post<MonitorCheck>(`${BASE}/${id}/check`);
  return normalizeCheck(data as MonitorCheck);
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
  const res = await apiClient.get<MonitorCheck[]>(`${BASE}/${id}/checks?${query}`);
  return {
    data: (res.data as MonitorCheck[]).map(normalizeCheck),
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
  const { data } = await apiClient.get<MonitorBaseline | null>(
    `${BASE}/${id}/content/baseline`
  );
  return data as MonitorBaseline | null;
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
  const { data } = await apiClient.get<MonitorTimeSeriesData | MonitorTimeSeriesPoint[]>(
    `${BASE}/${id}/series?period=${period}`
  );
  return normalizeSeriesPayload(period, data);
}

export async function getMonitorUptimeSummary(
  id: string,
  period: "24h" | "7d" | "30d" | "90d"
): Promise<MonitorUptimeSummary> {
  if (isMonitorMockMode()) return mockUptimeSummary(period);
  const { data } = await apiClient.get<MonitorUptimeSummary>(
    `${BASE}/${id}/uptime?period=${period}`
  );
  return data;
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
  const res = await apiClient.get<MonitorChange[]>(`${BASE}/${id}/changes?${query}`);
  return {
    data: res.data,
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
  const res = await apiClient.get<MonitorVisualCapture[]>(
    `${BASE}/${id}/visual/captures?${query}`
  );
  return { data: res.data, meta: readMeta(res as object) };
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
  const res = await apiClient.get<MonitorVisualChange[]>(
    `${BASE}/${id}/visual/changes?${query}`
  );
  return { data: res.data, meta: readMeta(res as object) };
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
  const { data } = await apiClient.get<MonitorDiff>(
    `${BASE}/${monitorId}/changes/${changeId}/diff`,
    { timeout: 180_000 }
  );
  return data;
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
  const res = await apiClient.get<MonitorIncident[]>(`${BASE}/${id}/incidents?${query}`);
  return {
    data: res.data as MonitorIncident[],
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
  const { data } = await apiClient.get<Record<string, unknown>>(`${BASE}/${id}/ssl`);
  return normalizeMonitorSsl(data ?? {});
}

export function subscribeMonitorUpdates(
  onUpdate: (payload: { id: string; event?: string }) => void
): EventSource {
  const es = new EventSource("/api/v1/monitors/live", { withCredentials: true });
  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as {
        id?: string;
        type?: string;
        event?: string;
      };
      if (data.type === "heartbeat" || !data.id) return;
      onUpdate({ id: data.id, event: data.event });
    } catch {
      /* ignore */
    }
  };
  return es;
}
