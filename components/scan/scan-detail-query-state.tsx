"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatQueryError(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return "Could not load scan details.";
}

export interface ScanDetailErrorCardProps {
  title?: string;
  error: unknown;
  onRetry?: () => void;
  retryPending?: boolean;
}

export function ScanDetailErrorCard({
  title = "Failed to load scan",
  error,
  onRetry,
  retryPending,
}: ScanDetailErrorCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{formatQueryError(error)}</p>
        {onRetry && (
          <Button type="button" variant="outline" disabled={retryPending} onClick={() => onRetry()}>
            {retryPending ? "Retrying…" : "Retry"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
