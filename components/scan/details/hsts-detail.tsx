import { Badge } from "@/components/ui/badge";
import { KeyValueCard } from "@/components/scan/details/key-value-card";
import type { HstsResult } from "@/shared/types/scan";

interface HstsDetailProps {
  data: HstsResult;
}

function formatMaxAge(seconds: number) {
  if (seconds % 86400 === 0) {
    const days = seconds / 86400;
    return `${seconds} seconds (${days} ${days === 1 ? "day" : "days"})`;
  }

  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${seconds} seconds (${hours} ${hours === 1 ? "hour" : "hours"})`;
  }

  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${seconds} seconds (${minutes} ${minutes === 1 ? "minute" : "minutes"})`;
  }

  return `${seconds} seconds`;
}

export function HstsDetail({ data }: HstsDetailProps) {
  return (
    <KeyValueCard
      title="HSTS Check"
      items={[
        {
          label: "Status",
          value: (
            <Badge
              className={`border-transparent ${
                data.enabled
                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
                  : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200"
              }`}
            >
              {data.enabled ? "Enabled" : "Disabled"}
            </Badge>
          ),
        },
        { label: "Max Age", value: formatMaxAge(data.maxAge) },
        { label: "Include Sub-Domains", value: data.includeSubDomains ? "✓" : "✗" },
        { label: "Preload", value: data.preload ? "✓" : "✗" },
        {
          label: "Raw Header",
          value: (
            <span className="font-mono text-zinc-600 dark:text-zinc-300">
              {data.rawHeader ?? "—"}
            </span>
          ),
        },
      ]}
    />
  );
}
