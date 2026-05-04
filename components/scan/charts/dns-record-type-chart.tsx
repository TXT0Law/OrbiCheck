"use client";

/**
 * Vertical bar chart of DNS record counts grouped by record type
 * (A / AAAA / CNAME / MX / NS / TXT / SOA).
 *
 * Pure presentation: takes a `DnsResult` (callers do not pre-aggregate) and
 * derives one bar per record type. Used on the DNS detail page so users can
 * spot at a glance which record types are populated vs. empty before
 * drilling into the per-type tabs.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import type { DnsResult } from "@/shared/types/scan";

export interface DnsRecordTypeChartProps {
  data: DnsResult | null | undefined;
  height?: number;
  emptyMessage?: string;
  isLoading?: boolean;
}

interface BarRow {
  type: string;
  count: number;
}

const DEFAULT_HEIGHT = 240;
const DEFAULT_EMPTY_MESSAGE =
  "DNS distribution unavailable — no record buckets reported by the scan.";

const RECORD_KEYS: Array<{ key: keyof DnsResult; label: string }> = [
  { key: "a", label: "A" },
  { key: "aaaa", label: "AAAA" },
  { key: "cname", label: "CNAME" },
  { key: "mx", label: "MX" },
  { key: "ns", label: "NS" },
  { key: "txt", label: "TXT" },
  { key: "soa", label: "SOA" },
];

const BAR_COLOR = "#2563eb";

function buildRows(data: DnsResult): BarRow[] {
  return RECORD_KEYS.map(({ key, label }) => {
    const value = data[key];
    const count = Array.isArray(value) ? value.length : 0;
    return { type: label, count };
  });
}

export function DnsRecordTypeChart({
  data,
  height = DEFAULT_HEIGHT,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  isLoading = false,
}: DnsRecordTypeChartProps) {
  if (isLoading) {
    return <Skeleton className="w-full" style={{ height }} />;
  }

  if (!data) {
    return (
      <div
        role="status"
        aria-label="DNS record distribution unavailable"
        className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-muted-foreground dark:border-zinc-700"
        style={{ minHeight: height }}
      >
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const rows = buildRows(data);
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  if (total === 0) {
    return (
      <div
        role="status"
        aria-label="DNS record distribution empty"
        className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-muted-foreground dark:border-zinc-700"
        style={{ minHeight: height }}
      >
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const tooltipBox = {
    backgroundColor: "rgba(24, 24, 27, 0.96)",
    border: "1px solid rgb(82, 82, 91)",
    borderRadius: "8px",
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.2)",
  } as const;

  return (
    <div
      className="w-full text-muted-foreground"
      role="img"
      aria-label={`DNS record distribution: ${rows
        .filter((row) => row.count > 0)
        .map((row) => `${row.type} ${row.count}`)
        .join(", ")}`}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={rows}
          margin={{ top: 8, right: 12, bottom: 8, left: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            className="stroke-zinc-200 dark:stroke-zinc-700"
          />
          <XAxis
            dataKey="type"
            stroke="currentColor"
            tick={{ fill: "currentColor", fontSize: 11 }}
          />
          <YAxis
            allowDecimals={false}
            stroke="currentColor"
            tick={{ fill: "currentColor", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={tooltipBox}
            labelStyle={{ color: "#fafafa", fontWeight: 700, fontSize: 13 }}
            itemStyle={{ color: "#fafafa", fontWeight: 600 }}
            formatter={(rawValue) => {
              const value = typeof rawValue === "number" ? rawValue : Number(rawValue ?? 0);
              return [`${value} record${value === 1 ? "" : "s"}`, "Count"];
            }}
          />
          <Bar
            dataKey="count"
            fill={BAR_COLOR}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
