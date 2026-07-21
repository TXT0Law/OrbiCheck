"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

import { useScanDetailContext } from "@/components/scan/scan-detail-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useScanDomainTimeline } from "@/lib/hooks/use-scan-trend";
import type { ScanTimelineRange } from "@/shared/types/scan";

const ScanTrendChart = dynamic(
  () =>
    import("@/components/scan/charts/scan-trend-chart").then(
      (module) => module.ScanTrendChart,
    ),
  {
    loading: () => (
      <p className="text-sm text-muted-foreground" role="status">
        Loading trend chart…
      </p>
    ),
    ssr: false,
  },
);

/** Whitelist of accepted ``range`` values, mirrors backend ``TIMELINE_RANGE_DAYS``. */
const RANGE_OPTIONS: { id: ScanTimelineRange; label: string }[] = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "all", label: "All time" },
];

const DEFAULT_RANGE: ScanTimelineRange = "all";

/** Default cap shown on the page; kept aligned with backend ``DEFAULT_TIMELINE_LIMIT``. */
const DEFAULT_LIMIT = 10;

function parseRange(value: string | null): ScanTimelineRange {
  if (!value) return DEFAULT_RANGE;
  const found = RANGE_OPTIONS.find((opt) => opt.id === value);
  return found ? found.id : DEFAULT_RANGE;
}

export default function ScanTrendPage() {
  const { detail } = useScanDetailContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const range = parseRange(searchParams.get("range"));
  const trendQuery = useScanDomainTimeline(detail.domain, {
    range,
    limit: DEFAULT_LIMIT,
  });

  const points = useMemo(
    () => trendQuery.data?.points ?? [],
    [trendQuery.data?.points],
  );

  const switchRange = (next: ScanTimelineRange) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_RANGE) {
      params.delete("range");
    } else {
      params.set("range", next);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const errorMessage =
    trendQuery.error instanceof Error
      ? trendQuery.error.message
      : trendQuery.error
        ? "Could not load the trend for this domain."
        : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Domain trend — {detail.domain}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Security score and finding counts for the most recent {DEFAULT_LIMIT} terminal
            scans of this domain.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Trend time range">
            {RANGE_OPTIONS.map((option) => (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant={option.id === range ? "default" : "outline"}
                onClick={() => switchRange(option.id)}
                aria-pressed={option.id === range}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {errorMessage ? (
            <div
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
            >
              Failed to load trend: {errorMessage}
            </div>
          ) : (
            <ScanTrendChart data={points} isLoading={trendQuery.isLoading} />
          )}

          {points.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Showing {points.length} scan
              {points.length === 1 ? "" : "s"} (oldest to newest).
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
