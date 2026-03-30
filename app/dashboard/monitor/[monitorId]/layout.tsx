import { MonitorDetailHeader } from "@/components/monitor/monitor-detail-header";
import { MonitorDetailProvider } from "@/components/monitor/monitor-detail-context";
import { MonitorSubNav } from "@/components/monitor/monitor-sub-nav";

interface MonitorDetailLayoutProps {
  children: React.ReactNode;
  params: { monitorId: string };
}

export default function MonitorDetailLayout({ children, params }: MonitorDetailLayoutProps) {
  return (
    <MonitorDetailProvider monitorId={params.monitorId}>
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <MonitorSubNav monitorId={params.monitorId} />
        <div className="md:pl-[260px]">
          <div className="space-y-6 p-4 md:p-8">
            <MonitorDetailHeader />
            <main>{children}</main>
          </div>
        </div>
      </div>
    </MonitorDetailProvider>
  );
}
