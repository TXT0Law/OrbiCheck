import Link from "next/link";
import { Suspense } from "react";

import { MonitorFilterBar } from "@/components/monitor/monitor-filter-bar";
import { MonitorListContent } from "@/components/monitor/monitor-list-content";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

export default function MonitorListPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Website Monitors
          </h1>
          <p className="text-muted-foreground">
            Track uptime, detect changes, and monitor SSL certificates.
          </p>
        </div>
        <Link
          href="/dashboard/monitor/new"
          className={cn(buttonVariants({ size: "lg" }), "inline-flex shadow-sm")}
        >
          <Plus className="h-5 w-5 shrink-0" aria-hidden />
          Add Monitor
        </Link>
      </div>

      <MonitorFilterBar />
      <Suspense
        fallback={<div className="text-sm text-muted-foreground">Loading monitors...</div>}
      >
        <MonitorListContent />
      </Suspense>
    </div>
  );
}
