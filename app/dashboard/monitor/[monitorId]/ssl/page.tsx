"use client";

import { MonitorCapabilityDisabled } from "@/components/monitor/monitor-capability-disabled";
import { useMonitorDetail } from "@/components/monitor/monitor-detail-context";
import { MonitorSslDetail } from "@/components/monitor/monitor-ssl-detail";
import { MonitorSslExpiryChart } from "@/components/monitor/monitor-ssl-expiry-chart";
import { MonitorSslSeverityCard } from "@/components/monitor/monitor-ssl-severity-card";
import { MonitorSslThresholdsBanner } from "@/components/monitor/monitor-ssl-thresholds-banner";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { getMonitorDetailMessages } from "@/lib/i18n/monitor-detail";

export default function MonitorSslPage() {
  const lang = useAppearanceLanguage();
  const td = getMonitorDetailMessages(lang);
  const { monitor } = useMonitorDetail();

  if (!monitor.enabledCapabilities.includes("ssl_expiry")) {
    return <MonitorCapabilityDisabled capability="ssl_expiry" monitorId={monitor.id} />;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">{td.sslTitle}</h2>

      <MonitorSslSeverityCard monitorId={monitor.id} />

      <MonitorSslDetail monitorId={monitor.id} />

      <MonitorSslExpiryChart monitorId={monitor.id} />

      <MonitorSslThresholdsBanner
        thresholds={monitor.capabilities.ssl_expiry.thresholds}
        monitorId={monitor.id}
      />
    </div>
  );
}
