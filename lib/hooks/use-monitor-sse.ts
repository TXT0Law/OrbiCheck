"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { monitorKeys } from "./use-monitors";

/**
 * SSE hook for live monitor status updates on the list page.
 * Disabled when NEXT_PUBLIC_MONITOR_SSE is "0" or when using mock API.
 */
export function useMonitorSSE() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_MONITOR_USE_MOCK === "1") return;
    if (process.env.NEXT_PUBLIC_MONITOR_SSE === "0") return;

    const es = new EventSource("/api/v1/monitors/live", { withCredentials: true });

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as {
          id?: string;
          type?: string;
          event?: string;
        };
        if (msg.type === "heartbeat") return;
        if (!msg?.id) return;

        void queryClient.invalidateQueries({ queryKey: monitorKeys.lists() });
        void queryClient.invalidateQueries({
          queryKey: monitorKeys.detail(msg.id),
          exact: false,
        });
      } catch {
        /* malformed payload */
      }
    };

    return () => {
      es.close();
    };
  }, [queryClient]);
}

/**
 * SSE for a single monitor detail route: refresh detail subtree when this monitor updates.
 * When the monitor is paused/disabled, do not subscribe so the detail query is not invalidated
 * on unrelated live traffic (and "Last check" stays stable).
 */
export function useMonitorDetailSSE(
  monitorId: string,
  options?: { monitorEnabled?: boolean }
) {
  const queryClient = useQueryClient();
  const monitorEnabled = options?.monitorEnabled ?? true;

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_MONITOR_USE_MOCK === "1") return;
    if (process.env.NEXT_PUBLIC_MONITOR_SSE === "0") return;
    if (!monitorEnabled) return;

    const es = new EventSource("/api/v1/monitors/live", { withCredentials: true });

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { id?: string; type?: string };
        if (msg.type === "heartbeat") return;
        if (msg?.id !== monitorId) return;

        void queryClient.invalidateQueries({
          queryKey: monitorKeys.detail(monitorId),
          exact: false,
        });
      } catch {
        /* malformed payload */
      }
    };

    return () => {
      es.close();
    };
  }, [monitorId, queryClient, monitorEnabled]);
}
