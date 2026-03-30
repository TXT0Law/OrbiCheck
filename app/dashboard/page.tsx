import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { MonitorHealth } from "@/components/dashboard/monitor-health";
import { QuickScan } from "@/components/dashboard/quick-scan";
import { RecentAlerts } from "@/components/dashboard/recent-alerts";
import { RecentScans } from "@/components/dashboard/recent-scans";
import { SslWatchlist } from "@/components/dashboard/ssl-watchlist";

export default function DashboardHomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Dashboard
        </h1>
        <p className="mt-1 text-muted-foreground">Overview of your security posture.</p>
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