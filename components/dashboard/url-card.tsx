import { Globe } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface UrlCardProps {
  url: string;
  domain: string;
  status: "queued" | "running" | "completed";
  timestamp: string;
  onClick?: () => void;
}

function getStatusBadge(status: UrlCardProps["status"]) {
  if (status === "running") {
    return <Badge variant="default">Running</Badge>;
  }

  if (status === "completed") {
    return <Badge variant="secondary">Completed</Badge>;
  }

  return (
    <Badge variant="outline" className="border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
      Queued
    </Badge>
  );
}

export function UrlCard({ url, domain, status, timestamp, onClick }: UrlCardProps) {
  return (
    <Card
      className="flex cursor-pointer items-center justify-between rounded-lg border p-4 transition hover:bg-zinc-50 dark:hover:bg-zinc-900"
      onClick={onClick}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Globe className="h-5 w-5 text-muted-foreground" />
        <div className="min-w-0">
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{domain}</p>
          <p className="truncate text-sm text-muted-foreground">{url}</p>
        </div>
      </div>

      <div className="ml-4 flex shrink-0 items-center gap-3">
        {getStatusBadge(status)}
        <span className="text-xs text-muted-foreground">{timestamp}</span>
      </div>
    </Card>
  );
}
