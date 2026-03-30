import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ────────────────────────────────────────────
// Props
// ────────────────────────────────────────────

export interface SummaryCardProps {
  title: string;
  icon?: string;
  status: "pass" | "warn" | "fail" | "info";
  summaryLines: string[];
  detailLink: string;
  detailLinkText: string;
}

// ────────────────────────────────────────────
// Component
// ────────────────────────────────────────────

export function SummaryCard({
  title,
  icon,
  status,
  summaryLines,
  detailLink,
  detailLinkText,
}: SummaryCardProps) {
  const statusConfig = {
    pass: {
      badge: "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400",
      label: "Pass",
    },
    warn: {
      badge: "border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
      label: "Warn",
    },
    fail: {
      badge: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400",
      label: "Fail",
    },
    info: {
      badge: "border-zinc-500/50 bg-zinc-500/10 text-zinc-700 dark:text-zinc-400",
      label: "Info",
    },
  };

  const { badge: badgeClass, label: statusLabel } = statusConfig[status];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {icon ? `${icon} ` : ""}
            {title}
          </span>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}
          >
            Status: {statusLabel}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {summaryLines.map((line, i) => (
            <p key={i} className="text-sm text-zinc-600 dark:text-zinc-300">
              {line}
            </p>
          ))}
        </div>
        <Link
          href={detailLink}
          className="mt-4 inline-flex items-center text-sm font-medium text-primary hover:underline"
        >
          {detailLinkText} →
        </Link>
      </CardContent>
    </Card>
  );
}
