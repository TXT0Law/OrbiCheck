"use client";

import { CheckCircle, Play, Timer, Zap } from "lucide-react";

import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTriggerCheck } from "@/lib/hooks/use-monitors";
import { CAPABILITY_CONFIG } from "@/shared/constants/monitor";

import { useMonitorDetail } from "./monitor-detail-context";

export function MonitorFirstRunGuide() {
  const { monitor } = useMonitorDetail();
  const triggerCheck = useTriggerCheck(monitor.id);
  const { toast } = useToast();

  async function handleFirstCheck() {
    try {
      await triggerCheck.mutateAsync();
      toast({
        title: "Check triggered",
        description: "Your first check is running. Results will appear shortly.",
      });
    } catch {
      toast({
        title: "Check failed",
        description: "Could not trigger check. Please try again.",
        variant: "destructive",
      });
    }
  }

  const intervalLabel =
    monitor.intervalSeconds < 60
      ? `every ${monitor.intervalSeconds} seconds`
      : `every ${monitor.intervalSeconds / 60} minutes`;

  return (
    <Card className="border-dashed border-sky-300 bg-sky-50/50 dark:border-sky-800 dark:bg-sky-950/20">
      <CardContent className="flex flex-col items-center py-10 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/50">
          <Zap className="h-7 w-7 text-sky-600 dark:text-sky-400" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Ready to start monitoring</h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          This monitor is configured to check{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{monitor.url}</span>{" "}
          {intervalLabel}.
        </p>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {monitor.enabledCapabilities.map((cap) => (
            <Badge key={cap} variant="secondary" className="text-[10px]">
              <CheckCircle className="mr-1 h-3 w-3" />
              {CAPABILITY_CONFIG[cap].label}
            </Badge>
          ))}
        </div>

        <Button className="mt-6" onClick={() => void handleFirstCheck()} disabled={triggerCheck.isPending}>
          <Play className="mr-2 h-4 w-4" />
          {triggerCheck.isPending ? "Running first check…" : "Run First Check"}
        </Button>

        <p className="mt-3 text-xs text-muted-foreground">
          <Timer className="mr-1 inline h-3 w-3" />
          Automatic checks follow your configured interval after data is available
        </p>
      </CardContent>
    </Card>
  );
}
