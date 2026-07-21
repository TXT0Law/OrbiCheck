"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

import { MonitorCapabilityDisabled } from "@/components/monitor/monitor-capability-disabled";
import { MonitorChecksTable } from "@/components/monitor/monitor-checks-table";
import { useMonitorDetail } from "@/components/monitor/monitor-detail-context";
import { MonitorSloTargetBar } from "@/components/monitor/monitor-slo-target-bar";
import { MonitorTimeRangePicker } from "@/components/monitor/monitor-time-range-picker";
import { MonitorUptimeSummary } from "@/components/monitor/monitor-uptime-summary";
import { MonitorUptimeThresholdsBanner } from "@/components/monitor/monitor-uptime-thresholds-banner";
import { MonitorUptimeSkeleton } from "@/components/monitor/skeletons/monitor-uptime-skeleton";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { useMonitorPeriod } from "@/lib/hooks/use-monitor-period";
import { getMonitorDetailMessages } from "@/lib/i18n/monitor-detail";
import { useMonitorUptime } from "@/lib/hooks/use-monitors";

const chartLoadingFallback = () => (
  <p className="text-sm text-muted-foreground" role="status">
    Loading chart…
  </p>
);

const MonitorFailureDistribution = dynamic(
  () =>
    import("@/components/monitor/monitor-failure-distribution").then(
      (module) => module.MonitorFailureDistribution,
    ),
  { loading: chartLoadingFallback, ssr: false },
);
const MonitorLatencyChart = dynamic(
  () =>
    import("@/components/monitor/monitor-latency-chart").then(
      (module) => module.MonitorLatencyChart,
    ),
  { loading: chartLoadingFallback, ssr: false },
);
const MonitorUptimeChart = dynamic(
  () =>
    import("@/components/monitor/monitor-uptime-chart").then(
      (module) => module.MonitorUptimeChart,
    ),
  { loading: chartLoadingFallback, ssr: false },
);

export default function MonitorUptimePage() {
  return (
    <Suspense fallback={<MonitorUptimeSkeleton />}>
      <MonitorUptimeContent />
    </Suspense>
  );
}

function MonitorUptimeContent() {
  const lang = useAppearanceLanguage();
  const td = getMonitorDetailMessages(lang);
  const { monitor } = useMonitorDetail();
  const { period } = useMonitorPeriod();
  const { data: uptimeData, isLoading: uptimeLoading } = useMonitorUptime(monitor.id, period);

  if (!monitor.enabledCapabilities.includes("uptime_only")) {
    return (
      <MonitorCapabilityDisabled capability="uptime_only" monitorId={monitor.id} />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">{td.uptimeTitle}</h2>
        <MonitorTimeRangePicker />
      </div>

      <MonitorSloTargetBar
        currentUptime={uptimeData?.uptimePercentage ?? null}
        period={period}
        isLoading={uptimeLoading}
        // TODO(monitor-slo-target-config): wire `monitor.sloTargetPercent`
        // (or equivalent capability config) here when the field lands; until
        // then `DEFAULT_SLO_TARGET` (99.9) is the implicit fallback.
      />

      <MonitorUptimeSummary monitorId={monitor.id} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <MonitorUptimeChart monitorId={monitor.id} />
        <MonitorLatencyChart monitorId={monitor.id} />
      </div>

      <MonitorFailureDistribution monitorId={monitor.id} />

      <MonitorUptimeThresholdsBanner
        thresholds={monitor.capabilities.uptime_only.thresholds}
        monitorId={monitor.id}
      />

      <MonitorChecksTable monitorId={monitor.id} />
    </div>
  );
}
