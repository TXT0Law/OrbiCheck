import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";

export function MonitorEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
      <Activity className="mb-4 h-12 w-12 text-sky-600 dark:text-sky-400" />
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">No monitors yet</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Add a URL to track uptime, content changes, and SSL certificate expiry.
      </p>
      <Link
        href="/dashboard/monitor/new"
        className={cn(buttonVariants({ size: "lg" }), "mt-8 inline-flex shadow-sm")}
      >
        Add your first monitor
      </Link>
    </div>
  );
}
