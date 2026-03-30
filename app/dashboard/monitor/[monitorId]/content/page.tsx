"use client";

import { Suspense, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { MonitorCapabilityDisabled } from "@/components/monitor/monitor-capability-disabled";
import { MonitorChangeTimeline } from "@/components/monitor/monitor-change-timeline";
import { useMonitorDetail } from "@/components/monitor/monitor-detail-context";
import { MonitorDiffViewer } from "@/components/monitor/monitor-diff-viewer";
import { MonitorSnapshotInfo } from "@/components/monitor/monitor-snapshot-info";
import { MonitorContentSkeleton } from "@/components/monitor/skeletons/monitor-content-skeleton";
import { useToast } from "@/components/ui/use-toast";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { monitorKeys } from "@/lib/hooks/use-monitors";
import { getMonitorContentMessages } from "@/lib/i18n/monitor-content";

export default function MonitorContentPage() {
  return (
    <Suspense fallback={<MonitorContentSkeleton />}>
      <MonitorContentPageInner />
    </Suspense>
  );
}

function MonitorContentPageInner() {
  const lang = useAppearanceLanguage();
  const t = getMonitorContentMessages(lang);
  const { toast } = useToast();
  const { monitor } = useMonitorDetail();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const diffRef = useRef<HTMLDivElement>(null);

  const selectedChangeId = searchParams.get("change");

  useEffect(() => {
    if (!selectedChangeId || !diffRef.current) return;
    const timer = window.setTimeout(() => {
      diffRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [selectedChangeId]);

  const handleSelectChange = useCallback(
    (changeId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (changeId) {
        params.set("change", changeId);
      } else {
        params.delete("change");
      }
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const handleDismissDiff = useCallback(() => {
    const cid = searchParams.get("change");
    if (cid) {
      queryClient.removeQueries({ queryKey: monitorKeys.diff(monitor.id, cid) });
    }
    handleSelectChange(null);
  }, [handleSelectChange, monitor.id, queryClient, searchParams]);

  if (!monitor.enabledCapabilities.includes("content_change")) {
    return (
      <MonitorCapabilityDisabled capability="content_change" monitorId={monitor.id} />
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">{t.pageTitle}</h2>

      <MonitorSnapshotInfo monitorId={monitor.id} />

      <MonitorChangeTimeline
        monitorId={monitor.id}
        onSelectChange={(id) => handleSelectChange(id)}
        selectedChangeId={selectedChangeId}
      />

      {selectedChangeId ? (
        <div ref={diffRef}>
          <MonitorDiffViewer
            monitorId={monitor.id}
            changeId={selectedChangeId}
            onDismiss={handleDismissDiff}
            onInvalidChange={() => {
              toast({ title: t.changeNotFoundToast, variant: "destructive" });
              handleSelectChange(null);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
