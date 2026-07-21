"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

import { AlertSSEProvider } from "@/components/alerts/alert-sse-provider";
import { Header } from "@/components/layout/header";
import { Sidebar, SidebarContent } from "@/components/layout/sidebar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useSessionGuard } from "@/lib/hooks/use-auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const sessionStatus = useSessionGuard();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const scanReservedSegments = ["groups", "new"];
  const scanMatch = pathname.match(/^\/dashboard\/scan\/([^/]+)/);
  const scanFirstSegment = scanMatch?.[1];
  const isScanDetailRoute =
    !!scanFirstSegment && !scanReservedSegments.includes(scanFirstSegment);

  const monitorMatch = pathname.match(/^\/dashboard\/monitor\/([^/]+)/);
  const monitorFirstSegment = monitorMatch?.[1];
  const isMonitorDetailRoute =
    !!monitorFirstSegment && monitorFirstSegment !== "new";

  if (sessionStatus === "checking") {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground"
        role="status"
      >
        Verifying session...
      </div>
    );
  }

  if (sessionStatus === "unauthenticated") {
    return null;
  }

  if (isScanDetailRoute || isMonitorDetailRoute) {
    return (
      <div className="min-h-screen bg-background">
        <AlertSSEProvider />
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AlertSSEProvider />
      <Sidebar />
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side="left"
          className="top-[var(--demo-bar-height,0px)] h-[calc(100vh-var(--demo-bar-height,0px))] w-[240px] p-0"
          aria-describedby={undefined}
        >
          <SidebarContent onClose={() => setSidebarOpen(false)} className="border-r-0" />
        </SheetContent>
      </Sheet>
      <div className="flex min-h-screen flex-col pt-[var(--demo-bar-height,0px)] md:ml-[240px]">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main id="main-content" tabIndex={-1} className="flex-1 p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}