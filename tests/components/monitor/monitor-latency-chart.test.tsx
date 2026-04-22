import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Recharts touches layout/SVG APIs that are flaky under jsdom; mock the chart
// primitives down to plain DOM so we can assert on the data the component
// actually feeds in (MonitorLatencyChart's value selection per metric is the
// behaviour we want to lock in here, not Recharts itself).
let lastChartData: Array<{ timestamp: string; responseTimeMs: number | null | undefined }> = [];
let lastLineColor: string | undefined;

vi.mock("recharts", () => {
  const passthrough = (name: string) => {
    const Component = (props: { children?: React.ReactNode }) => (
      <div data-recharts={name}>{props.children}</div>
    );
    Component.displayName = `Mock(${name})`;
    return Component;
  };

  return {
    ResponsiveContainer: passthrough("ResponsiveContainer"),
    LineChart: ({
      data,
      children,
    }: {
      data: typeof lastChartData;
      children?: React.ReactNode;
    }) => {
      lastChartData = data;
      return <div data-recharts="LineChart">{children}</div>;
    },
    Line: ({ stroke }: { stroke?: string }) => {
      lastLineColor = stroke;
      return <div data-recharts="Line" data-stroke={stroke} />;
    },
    CartesianGrid: passthrough("CartesianGrid"),
    XAxis: passthrough("XAxis"),
    YAxis: passthrough("YAxis"),
    Tooltip: passthrough("Tooltip"),
  };
});

const useMonitorPeriodMock = vi.fn();
const useMonitorTimeSeriesMock = vi.fn();

vi.mock("@/lib/hooks/use-monitor-period", () => ({
  useMonitorPeriod: () => useMonitorPeriodMock(),
}));

vi.mock("@/lib/hooks/use-monitors", () => ({
  useMonitorTimeSeries: (...args: unknown[]) => useMonitorTimeSeriesMock(...args),
}));

import { MonitorLatencyChart } from "@/components/monitor/monitor-latency-chart";

const SERIES = {
  points: [
    {
      timestamp: "2026-04-21T00:00:00Z",
      avgResponseTime: 100,
      maxResponseTime: 999,
      p50ResponseTime: 90,
      p95ResponseTime: 410,
      p99ResponseTime: 880,
    },
    {
      timestamp: "2026-04-21T00:01:00Z",
      avgResponseTime: 120,
      maxResponseTime: 1100,
      p50ResponseTime: 110,
      p95ResponseTime: 450,
      p99ResponseTime: 920,
    },
  ],
};

function renderChart() {
  useMonitorPeriodMock.mockReturnValue({ period: "last_24h" });
  useMonitorTimeSeriesMock.mockReturnValue({ isLoading: false, data: SERIES });
  return render(<MonitorLatencyChart monitorId="mon_test" />);
}

describe("MonitorLatencyChart (Phase 2.1 metric toggle)", () => {
  it("renders all four percentile toggle buttons in a labelled group", () => {
    renderChart();
    const group = screen.getByRole("group", { name: /latency metric/i });
    expect(group).toBeInTheDocument();
    for (const label of ["Avg", "p50", "p95", "p99"]) {
      expect(
        screen.getByRole("button", { name: new RegExp(`^${label}$`) }),
      ).toBeInTheDocument();
    }
  });

  it("defaults to Avg and feeds avgResponseTime values into the chart", () => {
    renderChart();
    const avgBtn = screen.getByRole("button", { name: /^Avg$/ });
    expect(avgBtn).toHaveAttribute("aria-pressed", "true");
    expect(lastChartData.map((d) => d.responseTimeMs)).toEqual([100, 120]);
  });

  it("feeds p99 values when the p99 toggle is selected", () => {
    renderChart();
    fireEvent.click(screen.getByRole("button", { name: /^p99$/ }));
    expect(screen.getByRole("button", { name: /^p99$/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /^Avg$/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(lastChartData.map((d) => d.responseTimeMs)).toEqual([880, 920]);
  });

  // Defensive: when the backend hasn't emitted a percentile (older buckets,
  // mid-rollout), the chart must fall back rather than render NaN/undefined gaps.
  it("falls back from p95 to maxResponseTime when p95ResponseTime is missing", () => {
    useMonitorPeriodMock.mockReturnValue({ period: "last_24h" });
    useMonitorTimeSeriesMock.mockReturnValue({
      isLoading: false,
      data: {
        points: [
          {
            timestamp: "2026-04-21T00:00:00Z",
            avgResponseTime: 100,
            maxResponseTime: 777,
          },
        ],
      },
    });
    render(<MonitorLatencyChart monitorId="mon_fallback" />);
    fireEvent.click(screen.getByRole("button", { name: /^p95$/ }));
    expect(lastChartData.map((d) => d.responseTimeMs)).toEqual([777]);
  });

  it("switches the line stroke colour when toggling between metrics", () => {
    renderChart();
    fireEvent.click(screen.getByRole("button", { name: /^Avg$/ }));
    const avgColor = lastLineColor;
    fireEvent.click(screen.getByRole("button", { name: /^p50$/ }));
    expect(lastLineColor).toBeDefined();
    expect(lastLineColor).not.toBe(avgColor);
  });
});
