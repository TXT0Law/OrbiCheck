"use client";

import { Globe } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ScanProgressProps {
  domain: string;
  progress: number;
  phase: string;
  detail: string;
  onCancel: () => void;
}

export function ScanProgress({ domain, progress, phase, detail, onCancel }: ScanProgressProps) {
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="truncate font-semibold text-zinc-900 dark:text-zinc-100">{domain}</span>
          </div>
          <Badge className="border-transparent bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">Running</Badge>
        </div>

        <div className="space-y-2">
          <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-zinc-900 transition-all duration-500 ease-out dark:bg-zinc-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-right text-sm text-muted-foreground">{progress}%</p>
        </div>

        <div className="flex items-end justify-between gap-3">
          <p className="text-sm text-muted-foreground">Phase: {phase} · {detail}</p>
          <Button
            type="button"
            onClick={onCancel}
            className="h-8 bg-transparent px-2 text-muted-foreground hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
            title="Stops the scan and keeps the record with partial results (does not delete history)"
          >
            Stop scan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}