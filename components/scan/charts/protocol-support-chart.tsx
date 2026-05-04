"use client";

/**
 * Compact bar chart of TLS protocol support status.
 *
 * Pure presentation: each protocol becomes one short bar coloured by its
 * `secure` rating (good / warning / danger) and its bar length encodes whether
 * the protocol is supported by the server. Lets the SSL/TLS detail page
 * surface the protocol matrix visually in addition to the table.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import type { ProtocolInfo } from "@/shared/types/scan";

export interface ProtocolSupportChartProps {
  data: ProtocolInfo[];
  height?: number;
  emptyMessage?: string;
  isLoading?: boolean;
}

interface BarRow {
  name: string;
  /** 1 when supported, 0 when explicitly unsupported. */
  supportValue: number;
  secure: ProtocolInfo["secure"];
  supported: boolean;
}

const DEFAULT_HEIGHT = 220;
const DEFAULT_EMPTY_MESSAGE =
  "Protocol matrix unavailable — TLS scan returned no protocol rows.";

const SECURE_COLORS: Record<ProtocolInfo["secure"], string> = {
  good: "#16a34a",
  warning: "#ca8a04",
  danger: "#dc2626",
};

const SECURE_LABELS: Record<ProtocolInfo["secure"], string> = {
  good: "Modern (TLS 1.2 / 1.3)",
  warning: "Deprecated",
  danger: "Insecure",
};

const COLOR_UNSUPPORTED_OK = "#a1a1aa";

function buildRows(protocols: ProtocolInfo[]): BarRow[] {
  return protocols.map((protocol) => ({
    name: protocol.name,
    supportValue: protocol.supported ? 1 : 0,
    secure: protocol.secure,
    supported: protocol.supported,
  }));
}

/**
 * Picks the bar colour: an unsupported "danger" protocol is GOOD news (e.g.
 * SSLv3 disabled) and should be shown as neutral grey, while a supported
 * "danger" protocol must shout red. This logic encodes the safety verdict
 * rather than the raw classification.
 */
function pickBarColor(row: BarRow): string {
  if (!row.supported) return COLOR_UNSUPPORTED_OK;
  return SECURE_COLORS[row.secure];
}

export function ProtocolSupportChart({
  data,
  height = DEFAULT_HEIGHT,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  isLoading = false,
}: ProtocolSupportChartProps) {
  if (isLoading) {
    return <Skeleton className="w-full" style={{ height }} />;
  }

  if (!data || data.length === 0) {
    return (
      <div
        role="status"
        aria-label="Protocol matrix unavailable"
        className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-muted-foreground dark:border-zinc-700"
        style={{ minHeight: height }}
      >
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const rows = buildRows(data);

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
      aria-label={`Protocol support matrix: ${rows
        .map((row) => `${row.name} ${row.supported ? "supported" : "disabled"}`)
        .join(", ")}`}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={false}
            className="stroke-zinc-200 dark:stroke-zinc-700"
          />
          <XAxis
            type="number"
            domain={[0, 1]}
            ticks={[0, 1]}
            stroke="currentColor"
            tick={{ fill: "currentColor", fontSize: 11 }}
            tickFormatter={(value) => (Number(value) === 1 ? "Yes" : "No")}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={100}
            stroke="currentColor"
            tick={{ fill: "currentColor", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={tooltipBox}
            labelStyle={{ color: "#fafafa", fontWeight: 700, fontSize: 13 }}
            itemStyle={{ color: "#fafafa", fontWeight: 600 }}
            formatter={(_rawValue, _name, item) => {
              const payload = item?.payload as BarRow | undefined;
              if (!payload) return ["—", "Status"];
              const support = payload.supported ? "Supported" : "Disabled";
              return [
                `${support} (${SECURE_LABELS[payload.secure]})`,
                "Status",
              ];
            }}
          />
          <Bar dataKey="supportValue" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.name} fill={pickBarColor(row)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
