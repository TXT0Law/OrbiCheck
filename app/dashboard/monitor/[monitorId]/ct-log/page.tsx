"use client";

import { Suspense } from "react";

import { MonitorCapabilityDisabled } from "@/components/monitor/monitor-capability-disabled";
import { MonitorCtHistory } from "@/components/monitor/monitor-ct-history";
import { useMonitorDetail } from "@/components/monitor/monitor-detail-context";
import { Skeleton } from "@/components/ui/skeleton";

export default function MonitorCtLogPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <MonitorCtLogContent />
    </Suspense>
  );
}

function MonitorCtLogContent() {
  const { monitor } = useMonitorDetail();

  if (!monitor.enabledCapabilities.includes("ct_log")) {
    return (
      <MonitorCapabilityDisabled capability="ct_log" monitorId={monitor.id} />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
          Certificate Transparency
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          New certificates issued for this hostname (sourced from crt.sh).
          Pinned serials are highlighted when unexpected entries appear.
        </p>
      </div>

      <MonitorCtHistory monitorId={monitor.id} />
    </div>
  );
}
