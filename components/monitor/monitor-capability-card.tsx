"use client";

import Link from "next/link";
import { Activity, FileCode, Globe, Image, ScrollText, Shield } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CAPABILITY_STATUS_CONFIG } from "@/shared/constants/monitor";
import type { CapabilityStatus, MonitorCapability } from "@/shared/types/monitor";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Activity,
  FileCode,
  Shield,
  Image,
  Globe,
  ScrollText,
};

function formatRelativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return new Date(iso).toLocaleDateString();
}

interface MonitorCapabilityCardProps {
  monitorId: string;
  capability: MonitorCapability;
  label: string;
  icon: string;
  enabled: boolean;
  status: CapabilityStatus;
  summary: string | null;
  lastCheckAt: string | null;
  /** Absolute path (e.g. `/dashboard/monitor/{id}/uptime`). Relative segments break resolution from `/monitor/{id}`. */
  href: string | null;
  comingSoon?: boolean;
}

export function MonitorCapabilityCard({
  monitorId,
  label,
  icon,
  enabled,
  status,
  summary,
  lastCheckAt,
  href,
  comingSoon,
}: MonitorCapabilityCardProps) {
  const Icon = ICON_MAP[icon];
  const statusConfig = CAPABILITY_STATUS_CONFIG[status] ?? CAPABILITY_STATUS_CONFIG.pending;

  const cardContent = (
    <Card
      className={cn(
        "transition-colors",
        enabled && href && "cursor-pointer hover:border-sky-400/60 dark:hover:border-sky-600/50",
        !enabled && "border-dashed border-zinc-300 opacity-70 dark:border-zinc-700"
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
          <span className="text-sm font-medium text-zinc-900 dark:text-white">{label}</span>
        </div>
        <span className={cn("h-2.5 w-2.5 rounded-full", statusConfig.dotClass)} />
      </CardHeader>
      <CardContent>
        {comingSoon ? (
          <p className="text-xs text-muted-foreground">Coming soon</p>
        ) : !enabled ? (
          <p className="text-xs text-muted-foreground">
            Not enabled —{" "}
            <Link
              href={`/dashboard/monitor/${monitorId}/settings`}
              className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              enable in Settings
            </Link>
          </p>
        ) : (
          <>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {summary ?? "No data yet"}
            </p>
            {lastCheckAt ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Last checked {formatRelativeTime(lastCheckAt)}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );

  if (enabled && href) {
    return <Link href={href}>{cardContent}</Link>;
  }
  return cardContent;
}
