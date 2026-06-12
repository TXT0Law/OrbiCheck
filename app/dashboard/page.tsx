"use client";

import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { MonitorHealth } from "@/components/dashboard/monitor-health";
import { QuickScan } from "@/components/dashboard/quick-scan";
import { RecentAlerts } from "@/components/dashboard/recent-alerts";
import { RecentScans } from "@/components/dashboard/recent-scans";
import { SslWatchlist } from "@/components/dashboard/ssl-watchlist";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { getDashboardMessages } from "@/lib/i18n/dashboard";

export default function DashboardHomePage() {
  const language = useAppearanceLanguage();
  const messages = getDashboardMessages(language).overview;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          {messages.title}
        </h1>
        <p className="mt-1 text-muted-foreground">{messages.subtitle}</p>
      </div>

      <DashboardStats />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <QuickScan />
        <MonitorHealth />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentScans />
        <RecentAlerts />
      </div>

      <SslWatchlist />
    </div>
  );
}