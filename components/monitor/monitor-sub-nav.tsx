"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowLeft, LayoutDashboard, Settings } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { useMonitorAlerts } from "@/lib/hooks/use-alerts";
import { cn } from "@/lib/utils";
import { CAPABILITY_STATUS_CONFIG, MONITOR_SUB_NAV } from "@/shared/constants/monitor";
import type { CapabilityStatus, MonitorCapability } from "@/shared/types/monitor";

import { useMonitorDetail } from "./monitor-detail-context";

interface MonitorSubNavProps {
  monitorId: string;
}

export function MonitorSubNav({ monitorId }: MonitorSubNavProps) {
  const pathname = usePathname();
  const { monitor } = useMonitorDetail();
  const { data: unacknowledgedAlerts } = useMonitorAlerts(monitorId, {
    suppressed: false,
    acknowledged: false,
    limit: 0,
  });
  const basePath = `/dashboard/monitor/${monitorId}`;
  const alertCount = unacknowledgedAlerts?.meta?.total ?? 0;

  const enabledSet = new Set(monitor.enabledCapabilities);

  function getCapabilityStatus(capability: MonitorCapability): CapabilityStatus {
    const found = monitor.capabilityStatuses.find((s) => s.capability === capability);
    if (!enabledSet.has(capability)) return "disabled";
    return found?.status ?? "pending";
  }

  function isActive(href: string): boolean {
    const fullPath = href ? `${basePath}${href}` : basePath;
    if (href === "") {
      return pathname === basePath || pathname === `${basePath}/`;
    }
    return pathname.startsWith(fullPath);
  }

  const mainItems = MONITOR_SUB_NAV.filter(
    (item) => !("position" in item && item.position === "bottom")
  );
  const bottomItems = MONITOR_SUB_NAV.filter(
    (item) => "position" in item && item.position === "bottom"
  );
  const overviewNavItem = mainItems.find((i) => i.key === "overview");
  const capabilityNavItems = mainItems.filter((i) => i.key !== "overview");

  const linkBase =
    "flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors";

  return (
    <aside className="w-full border-b border-border bg-card text-muted-foreground md:fixed md:left-0 md:top-0 md:z-30 md:h-screen md:w-[260px] md:border-r md:border-b-0">
      <div className="border-b border-border px-4 py-4">
        <Link
          href="/dashboard/monitor"
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          Back to Monitors
        </Link>
        <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">Monitor</p>
        <div className="mt-1 flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{monitor.displayName}</p>
          {alertCount > 0 ? (
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-medium text-red-200">
              {alertCount} alert{alertCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      </div>

      <ScrollArea className="max-h-[48vh] px-3 py-4 md:h-[calc(100vh-110px)] md:max-h-none">
        <div className="space-y-5 pb-4">
          {overviewNavItem ? (
            <section>
              <div className="mb-2 flex items-center gap-2 px-2">
                <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Overview</p>
              </div>
              <div className="space-y-1">
                <Link
                  href={`${basePath}${overviewNavItem.href}`}
                  className={cn(
                    linkBase,
                    isActive(overviewNavItem.href)
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <span className="truncate pr-2">{overviewNavItem.label}</span>
                </Link>
              </div>
            </section>
          ) : null}

          <section>
            <div className="mb-2 flex items-center gap-2 px-2">
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Capabilities</p>
            </div>
            <div className="space-y-1">
              {capabilityNavItems.map((item) => {
                const isCapabilityItem = "capability" in item && Boolean(item.capability);
                const cap = isCapabilityItem ? item.capability : null;
                const isDisabled = Boolean(cap && !enabledSet.has(cap));
                const capStatus = cap ? getCapabilityStatus(cap) : null;
                const active = isActive(item.href);
                const showComingSoon = Boolean(
                  "comingSoon" in item &&
                    (item as { comingSoon?: boolean }).comingSoon
                );
                const linkDisabled = Boolean(isDisabled || showComingSoon);
                const showHealthDot =
                  Boolean(capStatus) &&
                  !isDisabled &&
                  !showComingSoon &&
                  capStatus !== "disabled";
                const healthCfg =
                  capStatus != null
                    ? (CAPABILITY_STATUS_CONFIG[capStatus] ?? CAPABILITY_STATUS_CONFIG.pending)
                    : null;

                return (
                  <Link
                    key={item.key}
                    href={linkDisabled ? "#" : `${basePath}${item.href}`}
                    className={cn(
                      linkBase,
                      active && !linkDisabled
                        ? "bg-accent text-foreground"
                        : linkDisabled
                          ? "cursor-not-allowed text-muted-foreground/60"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      linkDisabled && "pointer-events-none opacity-60"
                    )}
                    aria-disabled={linkDisabled}
                    onClick={(e) => {
                      if (linkDisabled) e.preventDefault();
                    }}
                  >
                    <span className="truncate pr-2">{item.label}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {showHealthDot && healthCfg ? (
                        <span
                          className={cn("h-2 w-2 rounded-full", healthCfg.dotClass)}
                          title={healthCfg.label}
                        />
                      ) : null}
                      {showComingSoon ? (
                        <span className="text-xs text-muted-foreground">Soon</span>
                      ) : null}
                      {isDisabled && !showComingSoon ? (
                        <span className="text-xs text-muted-foreground">Off</span>
                      ) : null}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 px-2">
              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Configuration</p>
            </div>
            <div className="space-y-1">
              {bottomItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.key}
                    href={`${basePath}${item.href}`}
                    className={cn(
                      linkBase,
                      active
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      </ScrollArea>
    </aside>
  );
}
