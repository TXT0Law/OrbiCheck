"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

import { useToast } from "@/components/ui/use-toast";
import { getAlertContentMessages } from "@/lib/i18n/alert-content";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { alertKeys } from "@/lib/hooks/use-alerts";
import { cn } from "@/lib/utils";
import type { MonitorCapability } from "@/shared/types/monitor";

type LiveAlertPayload = {
  alertId: string;
  monitorId: string;
  capability: MonitorCapability;
  eventType: string;
  severity: "info" | "warning" | "critical";
  actualValue: string;
  message: string;
  suppressed: boolean;
  suppressReason: string | null;
  createdAt: string;
};

type LiveAlertMessage = {
  event?: string;
  monitorId?: string;
  data?: LiveAlertPayload;
  type?: string;
};

function getSeverityIcon(severity: LiveAlertPayload["severity"]) {
  if (severity === "critical") {
    return <AlertCircle className="h-4 w-4 text-red-500" aria-hidden />;
  }
  if (severity === "warning") {
    return <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />;
  }
  return <Info className="h-4 w-4 text-sky-500" aria-hidden />;
}

export function AlertSSEProvider() {
  const lang = useAppearanceLanguage();
  const messages = getAlertContentMessages(lang);
  const queryClient = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_MONITOR_USE_MOCK === "1") return;
    if (process.env.NEXT_PUBLIC_MONITOR_SSE === "0") return;

    const eventSource = new EventSource("/api/v1/monitors/live", {
      withCredentials: true,
    });

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as LiveAlertMessage;
        if (payload.type === "heartbeat") return;
        if (payload.event !== "alert_event" || !payload.data) return;
        if (payload.data.suppressed) return;

        void queryClient.invalidateQueries({ queryKey: alertKeys.all });

        const capabilityLabel = messages.capabilityMap[payload.data.capability];
        const severityIcon = getSeverityIcon(payload.data.severity);

        toast({
          title: (
            <span className="inline-flex items-center gap-2">
              {severityIcon}
              <span>
                {capabilityLabel} — {payload.data.message}
              </span>
            </span>
          ),
          description: messages.liveToastTitle,
          variant: payload.data.severity === "critical" ? "destructive" : "default",
          className:
            payload.data.severity === "warning"
              ? cn(
                  "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/90 dark:text-amber-50"
                )
              : undefined,
          duration:
            payload.data.severity === "critical"
              ? null
              : payload.data.severity === "warning"
                ? 10_000
                : 5_000,
          action: {
            label: messages.actions.view,
            onClick: () => router.push("/dashboard/alerts"),
          },
        });
      } catch {
        // Ignore malformed SSE payloads.
      }
    };

    return () => {
      eventSource.close();
    };
  }, [messages, queryClient, router, toast]);

  return null;
}
