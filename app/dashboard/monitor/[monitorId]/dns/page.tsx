"use client";

import { Suspense } from "react";

import { MonitorCapabilityDisabled } from "@/components/monitor/monitor-capability-disabled";
import { useMonitorDetail } from "@/components/monitor/monitor-detail-context";
import { MonitorDnsHistory } from "@/components/monitor/monitor-dns-history";
import { Skeleton } from "@/components/ui/skeleton";

export default function MonitorDnsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <MonitorDnsContent />
    </Suspense>
  );
}

function MonitorDnsContent() {
  const { monitor } = useMonitorDetail();

  if (!monitor.enabledCapabilities.includes("dns_change")) {
    return (
      <MonitorCapabilityDisabled capability="dns_change" monitorId={monitor.id} />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
          DNS Records & Changes
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Snapshot of currently observed records and the change log emitted by
          the periodic DNS probe.
        </p>
      </div>

      <MonitorDnsHistory monitorId={monitor.id} />
    </div>
  );
}
