import { DEFAULT_CAPABILITIES } from "@/shared/constants/monitor";
import type {
  CapabilityStatus,
  CapabilityStatusSummary,
  Monitor,
  MonitorCapabilities,
  MonitorCapability,
  PerCapabilityConfig,
} from "@/shared/types/monitor";
import { MONITOR_CAPABILITIES } from "@/shared/types/monitor";

/** Clone defaults and sync per-capability `enabled` with the monitor-level list. */
export function capabilitiesFromEnabledList(
  enabledCapabilities: MonitorCapability[]
): MonitorCapabilities {
  const caps = JSON.parse(JSON.stringify(DEFAULT_CAPABILITIES)) as MonitorCapabilities;
  const set = new Set(enabledCapabilities);
  for (const key of MONITOR_CAPABILITIES) {
    caps[key].enabled = set.has(key);
  }
  return caps;
}

export function summarizeCapabilityStatuses(
  monitor: Pick<
    Monitor,
    | "enabledCapabilities"
    | "uptimePercentage"
    | "sslExpiryDays"
    | "lastCheckAt"
    | "lastChangeDetectedAt"
    | "capabilities"
    | "status"
  >
): CapabilityStatusSummary[] {
  const results: CapabilityStatusSummary[] = [];

  for (const cap of MONITOR_CAPABILITIES) {
    if (!monitor.enabledCapabilities.includes(cap)) {
      results.push({
        capability: cap,
        status: "disabled",
        lastCheckAt: null,
        lastValue: null,
        summary: null,
      });
      continue;
    }

    let status: CapabilityStatus = "pending";
    let summary: string | null = null;
    let lastValue: string | null = null;
    const lastAt = monitor.lastCheckAt;

    if (cap === "uptime_only") {
      const pct = monitor.uptimePercentage;
      status =
        monitor.status === "down"
          ? "critical"
          : monitor.status === "degraded"
            ? "warning"
            : "healthy";
      if (pct != null) {
        summary = `${pct.toFixed(1)}% uptime (30d)`;
        lastValue = String(pct);
      } else {
        summary = "Collecting uptime data";
      }
    } else if (cap === "content_change") {
      status = monitor.lastChangeDetectedAt ? "warning" : "healthy";
      summary = monitor.lastChangeDetectedAt ? "Change detected" : "No changes";
      lastValue = monitor.lastChangeDetectedAt;
    } else if (cap === "ssl_expiry") {
      const days = monitor.sslExpiryDays;
      const th = monitor.capabilities.ssl_expiry.thresholds;
      if (days == null) {
        status = "pending";
        summary = "No SSL data";
      } else if (days <= 0) {
        status = "critical";
        summary = "Certificate expired";
        lastValue = String(days);
      } else if (days <= th.criticalDaysRemaining) {
        status = "critical";
        summary = `${days} days remaining`;
        lastValue = String(days);
      } else if (days <= th.warnDaysRemaining) {
        status = "warning";
        summary = `${days} days remaining`;
        lastValue = String(days);
      } else {
        status = "healthy";
        summary = `${days} days remaining`;
        lastValue = String(days);
      }
    } else {
      status = "pending";
      summary = "Coming soon";
    }

    results.push({
      capability: cap,
      status,
      lastCheckAt: lastAt,
      lastValue,
      summary,
    });
  }

  return results;
}

export function mergeCapabilityPatch(
  base: MonitorCapabilities,
  patch: Partial<MonitorCapabilities>
): MonitorCapabilities {
  const out = JSON.parse(JSON.stringify(base)) as MonitorCapabilities;
  for (const key of MONITOR_CAPABILITIES as readonly MonitorCapability[]) {
    const p = patch[key];
    if (!p) continue;
    const cur = out[key];
    const mergedThresholds = { ...cur.thresholds, ...(p.thresholds ?? {}) };
    const row: PerCapabilityConfig = {
      ...cur,
      ...p,
      alert: { ...cur.alert, ...(p.alert ?? {}) },
      thresholds: mergedThresholds as PerCapabilityConfig["thresholds"],
    };
    (out as Record<MonitorCapability, PerCapabilityConfig>)[key] = row;
  }
  return out;
}
