"use client";

import { usePathname } from "next/navigation";

import { AlertSSEProvider } from "@/components/alerts/alert-sse-provider";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const scanReservedSegments = ["groups", "new"];
  const scanMatch = pathname.match(/^\/dashboard\/scan\/([^/]+)/);
  const scanFirstSegment = scanMatch?.[1];
  const isScanDetailRoute =
    !!scanFirstSegment && !scanReservedSegments.includes(scanFirstSegment);

  const monitorMatch = pathname.match(/^\/dashboard\/monitor\/([^/]+)/);
  const monitorFirstSegment = monitorMatch?.[1];
  const isMonitorDetailRoute =
    !!monitorFirstSegment && monitorFirstSegment !== "new";

  if (isScanDetailRoute || isMonitorDetailRoute) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <AlertSSEProvider />
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <AlertSSEProvider />
      <Sidebar />
      <div className="ml-[240px] min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}