import {
  capabilitiesFromEnabledList,
  summarizeCapabilityStatuses,
} from "@/lib/utils/monitor-capabilities";
import type {
  Monitor,
  MonitorChange,
  MonitorCheck,
  MonitorCreateRequest,
  MonitorDiff,
  MonitorIncident,
  MonitorSslStatus,
  MonitorTimeSeriesPoint,
  MonitorUptimeSummary,
} from "@/shared/types/monitor";

const now = () => new Date().toISOString();

function buildMonitor(partial: Omit<Monitor, "capabilities" | "capabilityStatuses"> & {
  capabilities?: Monitor["capabilities"];
}): Monitor {
  const capabilities =
    partial.capabilities ?? capabilitiesFromEnabledList(partial.enabledCapabilities);
  const base = { ...partial, capabilities };
  return {
    ...base,
    capabilityStatuses: summarizeCapabilityStatuses(base),
  };
}

export const MOCK_MONITORS: Monitor[] = [
  buildMonitor({
    id: "00000000-0000-4000-8000-000000000001",
    displayName: "Example HTTPS",
    url: "https://example.com",
    enabledCapabilities: ["uptime_only", "ssl_expiry"],
    intervalSeconds: 60,
    httpMethod: "GET",
    expectedStatusCode: null,
    isEnabled: true,
    status: "up",
    lastCheckAt: now(),
    lastStatusCode: 200,
    lastResponseTimeMs: 142,
    lastChangeDetectedAt: null,
    sslExpiryDays: 88,
    totalChecks: 1204,
    uptimePercentage: 99.8,
    avgResponseTimeMs: 156,
    tags: ["demo"],
    createdAt: now(),
    updatedAt: now(),
  }),
  buildMonitor({
    id: "00000000-0000-4000-8000-000000000002",
    displayName: "Content watch",
    url: "https://example.org",
    enabledCapabilities: ["content_change", "uptime_only"],
    intervalSeconds: 300,
    httpMethod: "GET",
    expectedStatusCode: 200,
    isEnabled: true,
    status: "degraded",
    lastCheckAt: now(),
    lastStatusCode: 200,
    lastResponseTimeMs: 2100,
    lastChangeDetectedAt: now(),
    sslExpiryDays: 12,
    totalChecks: 88,
    uptimePercentage: 97.2,
    avgResponseTimeMs: 890,
    tags: [],
    createdAt: now(),
    updatedAt: now(),
  }),
];

export function mockListMeta(total: number) {
  return { page: 1, limit: 20, total };
}

function evaluatedForMonitor(monitorId: string): MonitorCheck["evaluatedCapabilities"] {
  const m = MOCK_MONITORS.find((x) => x.id === monitorId);
  return m ? [...m.enabledCapabilities] : ["uptime_only"];
}

export function mockChecks(monitorId: string): MonitorCheck[] {
  const base = Date.now();
  const caps = evaluatedForMonitor(monitorId);
  return Array.from({ length: 8 }, (_, i) => ({
    id: `chk-${monitorId}-${i}`,
    monitorId,
    checkedAt: new Date(base - i * 3600_000).toISOString(),
    success: i !== 2,
    statusCode: i === 2 ? 503 : 200,
    responseTimeMs: 120 + i * 15,
    errorType: i === 2 ? ("http_error" as const) : null,
    errorMessage: i === 2 ? "Service unavailable" : null,
    contentHash: i === 0 ? "a".repeat(64) : null,
    contentChanged: false,
    snapshotId: i === 0 ? `snap-${monitorId}-0` : null,
    sslDaysRemaining: 90 - i,
    evaluatedCapabilities: caps,
  }));
}

export function mockSeries(period: "24h" | "7d" | "30d" | "90d"): MonitorTimeSeriesPoint[] {
  const buckets =
    period === "24h" ? 24 : period === "7d" ? 28 : period === "30d" ? 30 : 24;
  const stepMs =
    period === "24h"
      ? 3600_000
      : period === "7d"
        ? 6 * 3600_000
        : period === "30d"
          ? 24 * 3600_000
          : 4 * 24 * 3600_000;
  const t0 = Date.now() - buckets * stepMs;
  return Array.from({ length: buckets }, (_, i) => ({
    timestamp: new Date(t0 + i * stepMs).toISOString(),
    responseTimeMs: 100 + (i % 5) * 40,
    statusCode: i % 11 === 0 ? 503 : 200,
    success: i % 11 !== 0,
  }));
}

export function mockUptimeSummary(period: MonitorUptimeSummary["period"]): MonitorUptimeSummary {
  const totalChecks = period === "24h" ? 1440 : 10080;
  const successfulChecks = period === "24h" ? 1420 : 9980;
  return {
    period,
    totalChecks,
    successfulChecks,
    failedChecks: totalChecks - successfulChecks,
    uptimePercentage: 98.6,
    avgResponseTimeMs: 210,
    p95ResponseTimeMs: 480,
    incidents: period === "24h" ? 1 : 4,
  };
}

const MOCK_INCIDENTS_ALL: MonitorIncident[] = [
  {
    id: "inc-1",
    monitorId: "00000000-0000-4000-8000-000000000001",
    capability: "uptime_only",
    type: "downtime",
    startedAt: new Date(Date.now() - 7_200_000).toISOString(),
    resolvedAt: new Date(Date.now() - 3_600_000).toISOString(),
    durationSeconds: 3600,
    title: "Service unavailable",
    description: "HTTP 503 responses for 1 hour. Resolved automatically.",
  },
  {
    id: "inc-2",
    monitorId: "00000000-0000-4000-8000-000000000001",
    capability: "ssl_expiry",
    type: "ssl_warning",
    startedAt: new Date(Date.now() - 86_400_000).toISOString(),
    resolvedAt: null,
    durationSeconds: null,
    title: "SSL certificate expiring soon",
    description: "Certificate will expire within the warning window. Plan renewal.",
  },
];

export function mockIncidents(monitorId: string, limit = 20): MonitorIncident[] {
  return MOCK_INCIDENTS_ALL.filter((i) => i.monitorId === monitorId).slice(0, limit);
}

function changeCategoryFromLines(
  linesAdded: number,
  linesRemoved: number
): "small" | "medium" | "large" {
  const total = linesAdded + linesRemoved;
  if (total <= 10) return "small";
  if (total <= 50) return "medium";
  return "large";
}

export function mockChanges(monitorId: string): MonitorChange[] {
  return Array.from({ length: 25 }, (_, i) => {
    const linesAdded = i % 4 === 0 ? 3 : i % 4 === 1 ? 15 : i % 4 === 2 ? 60 : 8;
    const linesRemoved = i % 3;
    const linesChanged = i % 2;
    const totalDiffLines = linesAdded + linesRemoved;
    const changeCategory = changeCategoryFromLines(linesAdded, linesRemoved);
    return {
      id: `00000000-0000-4000-8000-${(0xc000 + i).toString(16).padStart(12, "0")}`,
      monitorId,
      detectedAt: new Date(Date.now() - (i + 1) * 86_400_000).toISOString(),
      previousSnapshotId: `00000000-0000-4000-8000-${(0xa000 + i).toString(16).padStart(12, "0")}`,
      currentSnapshotId: `00000000-0000-4000-8000-${(0xb000 + i).toString(16).padStart(12, "0")}`,
      diffSummary: {
        linesAdded,
        linesRemoved,
        linesChanged,
        totalDiffLines,
        changeCategory,
      },
    };
  });
}

export function mockDiff(changeId: string): MonitorDiff {
  return {
    changeId,
    previousContent: "<html><body><h1>Old</h1></body></html>",
    currentContent: "<html><body><h1>New</h1><p>Extra</p></body></html>",
    diffHtml:
      '<table class="diff"><tr><td class="diff_sub">- Old</td></tr><tr><td class="diff_add">+ New</td></tr></table>',
    truncated: false,
    originalPreviousLength: 42,
    originalCurrentLength: 52,
  };
}

export function buildMonitorFromCreateRequest(data: MonitorCreateRequest): Monitor {
  return buildMonitor({
    id: crypto.randomUUID(),
    displayName: data.displayName,
    url: data.url,
    enabledCapabilities: data.enabledCapabilities,
    intervalSeconds: data.intervalSeconds as Monitor["intervalSeconds"],
    httpMethod: data.httpMethod,
    expectedStatusCode: data.expectedStatusCode,
    isEnabled: true,
    status: "pending",
    lastCheckAt: null,
    lastStatusCode: null,
    lastResponseTimeMs: null,
    lastChangeDetectedAt: null,
    sslExpiryDays: null,
    totalChecks: 0,
    uptimePercentage: null,
    avgResponseTimeMs: null,
    tags: data.tags ?? [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export function mockSsl(): MonitorSslStatus {
  return {
    issuer: "CN=Example CA",
    subject: "CN=example.com",
    validFrom: new Date(Date.now() - 86400_000 * 30).toISOString(),
    validTo: new Date(Date.now() + 86400_000 * 60).toISOString(),
    daysRemaining: 60,
    isExpiringSoon: false,
    isExpired: false,
    lastCheckedAt: now(),
    subjectAlternativeNames: ["example.com", "*.example.com"],
    chainSummary: [
      {
        subject: "CN=example.com",
        issuer: "CN=Example CA",
        validTo: new Date(Date.now() + 86400_000 * 60).toISOString(),
      },
    ],
    severityLevel: "ok",
  };
}
