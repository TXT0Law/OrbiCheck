"use client";

import { createContext, useContext, type ReactNode } from "react";

import { MonitorDetailError } from "@/components/monitor/monitor-detail-error";
import { MonitorDetailProviderSkeleton } from "@/components/monitor/monitor-detail-provider-skeleton";
import { useMonitor } from "@/lib/hooks/use-monitors";
import { useMonitorDetailSSE } from "@/lib/hooks/use-monitor-sse";
import type { Monitor } from "@/shared/types/monitor";

interface MonitorDetailContextValue {
  monitor: Monitor;
  monitorId: string;
  isLoading: boolean;
  refetch: () => void;
}

const MonitorDetailContext = createContext<MonitorDetailContextValue | null>(null);

export function useMonitorDetail(): MonitorDetailContextValue {
  const ctx = useContext(MonitorDetailContext);
  if (!ctx) {
    throw new Error("useMonitorDetail must be used within MonitorDetailProvider");
  }
  return ctx;
}

interface MonitorDetailProviderProps {
  monitorId: string;
  children: ReactNode;
}

function MonitorDetailSSEBridge({
  monitorId,
  monitorEnabled,
}: {
  monitorId: string;
  monitorEnabled: boolean;
}) {
  useMonitorDetailSSE(monitorId, { monitorEnabled });
  return null;
}

export function MonitorDetailProvider({ monitorId, children }: MonitorDetailProviderProps) {
  const { data, isLoading, isError, error, refetch, isRefetching, isSuccess } = useMonitor(monitorId);

  if (isLoading) {
    return <MonitorDetailProviderSkeleton />;
  }

  if (isError || !data) {
    return (
      <MonitorDetailError
        error={error instanceof Error ? error : error ? new Error(String(error)) : null}
        onRetry={() => {
          void refetch();
        }}
        isRetrying={isRefetching}
      />
    );
  }

  return (
    <MonitorDetailContext.Provider
      value={{
        monitor: data,
        monitorId,
        isLoading,
        refetch: () => {
          void refetch();
        },
      }}
    >
      {isSuccess ? (
        <MonitorDetailSSEBridge monitorId={monitorId} monitorEnabled={data.isEnabled} />
      ) : null}
      {children}
    </MonitorDetailContext.Provider>
  );
}
