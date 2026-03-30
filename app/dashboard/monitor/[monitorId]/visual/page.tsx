"use client";

import { MonitorCapabilityDisabled } from "@/components/monitor/monitor-capability-disabled";
import { useMonitorDetail } from "@/components/monitor/monitor-detail-context";
import { MonitorVisualTimeline } from "@/components/monitor/monitor-visual-timeline";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { getMonitorDetailMessages } from "@/lib/i18n/monitor-detail";

export default function MonitorVisualPage() {
  const lang = useAppearanceLanguage();
  const td = getMonitorDetailMessages(lang);
  const { monitor } = useMonitorDetail();

  if (!monitor.enabledCapabilities.includes("visual_change")) {
    return (
      <MonitorCapabilityDisabled capability="visual_change" monitorId={monitor.id} />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">{td.visualTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{td.visualIntro}</p>
      </div>

      <MonitorVisualTimeline monitorId={monitor.id} />
    </div>
  );
}
