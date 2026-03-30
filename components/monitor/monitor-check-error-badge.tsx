"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CheckErrorType } from "@/shared/types/monitor";

const ERROR_TYPE_LABELS: Record<CheckErrorType, string> = {
  timeout: "Timeout",
  dns_resolution: "DNS Error",
  connection_refused: "Connection Refused",
  ssl_error: "SSL Error",
  http_error: "HTTP Error",
  content_too_large: "Body limit",
  unknown: "Unknown Error",
};

const ERROR_TYPE_DESCRIPTIONS: Partial<Record<CheckErrorType, string>> = {
  content_too_large:
    "Response exceeded the configured max body size for content capture. This is not a “no change” result — the probe failed before a full snapshot could be stored.",
};

interface MonitorCheckErrorBadgeProps {
  errorType: CheckErrorType | null;
  errorMessage?: string | null;
}

export function MonitorCheckErrorBadge({ errorType, errorMessage }: MonitorCheckErrorBadgeProps) {
  if (!errorType) return null;
  const label = ERROR_TYPE_LABELS[errorType] ?? errorType;
  const mergedMessage =
    errorMessage && errorMessage.trim().length > 0
      ? errorMessage
      : ERROR_TYPE_DESCRIPTIONS[errorType];

  if (!mergedMessage) {
    return (
      <Badge variant="destructive" className="text-[10px]">
        {label}
      </Badge>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Badge variant="destructive" className="cursor-help text-[10px]">
              {label}
            </Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs">{mergedMessage}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
