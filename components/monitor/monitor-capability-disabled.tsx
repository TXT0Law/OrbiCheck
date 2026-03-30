"use client";

import Link from "next/link";
import { AlertCircle, Settings } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { CAPABILITY_CONFIG } from "@/shared/constants/monitor";
import type { MonitorCapability } from "@/shared/types/monitor";

interface MonitorCapabilityDisabledProps {
  capability: MonitorCapability;
  monitorId: string;
}

export function MonitorCapabilityDisabled({ capability, monitorId }: MonitorCapabilityDisabledProps) {
  const config = CAPABILITY_CONFIG[capability];

  return (
    <div className="flex min-h-[280px] items-center justify-center">
      <Card className="max-w-md border-dashed border-zinc-300 dark:border-zinc-700">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <AlertCircle className="mb-4 h-10 w-10 text-zinc-400" />
          <h3 className="text-lg font-medium text-zinc-900 dark:text-white">{config.label} is not enabled</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {config.description}. Enable this capability in monitor settings to start collecting data.
          </p>
          <Link
            href={`/dashboard/monitor/${monitorId}/settings`}
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md border-2 border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            <Settings className="mr-2 h-4 w-4" />
            Go to Settings
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
