"use client";

import Link from "next/link";
import { Suspense } from "react";

import { MonitorFilterBar } from "@/components/monitor/monitor-filter-bar";
import { MonitorListContent } from "@/components/monitor/monitor-list-content";
import { buttonVariants } from "@/components/ui/button";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { getDashboardMessages } from "@/lib/i18n/dashboard";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

export default function MonitorListPage() {
  const language = useAppearanceLanguage();
  const messages = getDashboardMessages(language).monitor;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            {messages.title}
          </h1>
          <p className="text-muted-foreground">
            {messages.subtitle}
          </p>
        </div>
        <Link
          href="/dashboard/monitor/new"
          className={cn(buttonVariants({ size: "lg" }), "inline-flex shadow-sm")}
        >
          <Plus className="h-5 w-5 shrink-0" aria-hidden />
          {messages.addMonitor}
        </Link>
      </div>

      <MonitorFilterBar />
      <Suspense
        fallback={<div className="text-sm text-muted-foreground">{messages.loadingMonitors}</div>}
      >
        <MonitorListContent />
      </Suspense>
    </div>
  );
}
