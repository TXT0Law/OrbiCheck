"use client";

import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MonitorDetailErrorProps {
  error: Error | null;
  onRetry: () => void;
  isRetrying?: boolean;
}

export function MonitorDetailError({
  error,
  onRetry,
  isRetrying = false,
}: MonitorDetailErrorProps) {
  return (
    <div className="flex min-h-[320px] items-center justify-center p-6">
      <Card className="max-w-md">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <AlertCircle className="mb-4 h-12 w-12 text-red-600" />
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Failed to load monitor</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {error?.message === "Monitor not found"
              ? "This monitor may have been deleted or you don't have access."
              : "An error occurred while loading monitor data. Please try again."}
          </p>
          {error?.message && error.message !== "Monitor not found" ? (
            <code className="mt-3 rounded bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800">{error.message}</code>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard/monitor"
              className={cn(buttonVariants({ variant: "outline" }), "inline-flex")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Monitors
            </Link>
            <Button onClick={onRetry} disabled={isRetrying}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} />
              {isRetrying ? "Retrying…" : "Retry"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
