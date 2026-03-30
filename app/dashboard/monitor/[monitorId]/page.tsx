"use client";

import { MonitorCapabilityCard } from "@/components/monitor/monitor-capability-card";
import { MonitorFirstRunGuide } from "@/components/monitor/monitor-first-run-guide";
import { MonitorIncidentsTimeline } from "@/components/monitor/monitor-incidents-timeline";
import { MonitorOverviewSummaryStrip } from "@/components/monitor/monitor-overview-summary-strip";
import { MonitorRecentActivity } from "@/components/monitor/monitor-recent-activity";
import { useMonitorDetail } from "@/components/monitor/monitor-detail-context";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { getMonitorDetailMessages } from "@/lib/i18n/monitor-detail";
import { CAPABILITY_CONFIG } from "@/shared/constants/monitor";
import { MONITOR_CAPABILITIES } from "@/shared/types/monitor";

export default function MonitorOverviewPage() {
  const lang = useAppearanceLanguage();
  const td = getMonitorDetailMessages(lang);
  const { monitor } = useMonitorDetail();
  const isFirstRun = monitor.totalChecks === 0;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">{td.overviewTitle}</h2>

      <MonitorOverviewSummaryStrip />

      {isFirstRun ? (
        <MonitorFirstRunGuide />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MONITOR_CAPABILITIES.map((cap) => {
              const config = CAPABILITY_CONFIG[cap];
              const isEnabled = monitor.enabledCapabilities.includes(cap);
              const statusInfo = monitor.capabilityStatuses.find((s) => s.capability === cap);
              return (
                <MonitorCapabilityCard
                  key={cap}
                  monitorId={monitor.id}
                  capability={cap}
                  label={config.label}
                  icon={config.icon}
                  enabled={isEnabled}
                  status={statusInfo?.status ?? "disabled"}
                  summary={statusInfo?.summary ?? null}
                  lastCheckAt={statusInfo?.lastCheckAt ?? null}
                  href={
                    isEnabled
                      ? `/dashboard/monitor/${monitor.id}/${config.subRoute}`
                      : null
                  }
                  comingSoon={"comingSoon" in config && !!config.comingSoon}
                />
              );
            })}
          </div>

          <MonitorIncidentsTimeline monitorId={monitor.id} limit={5} />

          <MonitorRecentActivity monitorId={monitor.id} />
        </>
      )}
    </div>
  );
}
