"use client";

/**
 * Donut chart of cipher suite counts grouped by strength
 * (strong / acceptable / weak / insecure).
 *
 * Pure presentation: takes a `CipherInfo[]` and aggregates per-strength
 * counts before rendering. Used on the SSL/TLS detail pages so weak/insecure
 * cipher counts are immediately spottable next to the suite table.
 */

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import type { CipherInfo } from "@/shared/types/scan";

export interface CipherStrengthChartProps {
  data: CipherInfo[];
  height?: number;
  emptyMessage?: string;
  isLoading?: boolean;
}

interface DonutSlice {
  key: CipherInfo["strength"];
  label: string;
  value: number;
  color: string;
}

const DEFAULT_HEIGHT = 240;
const DEFAULT_EMPTY_MESSAGE =
  "Cipher distribution unavailable — TLS scan returned no cipher suites.";

const SLICE_COLORS: Record<CipherInfo["strength"], string> = {
  strong: "#16a34a",
  acceptable: "#2563eb",
  weak: "#ea580c",
  insecure: "#dc2626",
};

const SLICE_LABELS: Record<CipherInfo["strength"], string> = {
  strong: "Strong",
  acceptable: "Acceptable",
  weak: "Weak",
  insecure: "Insecure",
};

const STRENGTH_ORDER: Array<CipherInfo["strength"]> = [
  "strong",
  "acceptable",
  "weak",
  "insecure",
];

function buildSlices(data: CipherInfo[]): DonutSlice[] {
  const counts: Record<CipherInfo["strength"], number> = {
    strong: 0,
    acceptable: 0,
    weak: 0,
    insecure: 0,
  };
  for (const cipher of data) {
    if (cipher.strength in counts) {
      counts[cipher.strength] += 1;
    }
  }
  return STRENGTH_ORDER.map((strength) => ({
    key: strength,
    label: SLICE_LABELS[strength],
    value: counts[strength],
    color: SLICE_COLORS[strength],
  }));
}

export function CipherStrengthChart({
  data,
  height = DEFAULT_HEIGHT,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  isLoading = false,
}: CipherStrengthChartProps) {
  if (isLoading) {
    return <Skeleton className="w-full" style={{ height }} />;
  }

  if (!data || data.length === 0) {
    return (
      <div
        role="status"
        aria-label="Cipher strength distribution unavailable"
        className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-muted-foreground dark:border-zinc-700"
        style={{ minHeight: height }}
      >
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const slices = buildSlices(data);
  const visibleSlices = slices.filter((slice) => slice.value > 0);

  if (visibleSlices.length === 0) {
    return (
      <div
        role="status"
        aria-label="Cipher strength distribution empty"
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
      className="w-full"
      role="img"
      aria-label={`Cipher strength distribution: ${visibleSlices
        .map((slice) => `${slice.label} ${slice.value}`)
        .join(", ")}`}
    >
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={visibleSlices}
            dataKey="value"
            nameKey="label"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={1}
            stroke="none"
            isAnimationActive={false}
          >
            {visibleSlices.map((slice) => (
              <Cell key={slice.key} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipBox}
            labelStyle={{ color: "#fafafa", fontWeight: 700, fontSize: 13 }}
            itemStyle={{ color: "#fafafa", fontWeight: 600 }}
            formatter={(rawValue, name) => [
              `${typeof rawValue === "number" ? rawValue : (rawValue ?? "")}`,
              name,
            ]}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            wrapperStyle={{ paddingTop: 8, color: "currentColor", fontSize: 12 }}
            formatter={(value: string) => (
              <span className="text-zinc-700 dark:text-zinc-200">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
