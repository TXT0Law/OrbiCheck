import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, it, expect, vi } from "vitest";

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
    BarChart: passthrough("BarChart"),
    Bar: passthrough("Bar"),
    CartesianGrid: passthrough("CartesianGrid"),
    XAxis: passthrough("XAxis"),
    YAxis: passthrough("YAxis"),
    Tooltip: passthrough("Tooltip"),
  };
});

import { TechStackDetail } from "@/components/scan/details/tech-stack-detail";
import type { TechStackItem } from "@/shared/types/scan";

describe("TechStackDetail", () => {
  it("shows empty state when no items", () => {
    render(<TechStackDetail data={[]} />);
    expect(
      screen.getByText("No technology fingerprint data is available for this scan.")
    ).toBeInTheDocument();
  });

  it("groups by category and handles duplicate tech names via composite keys", () => {
    const items: TechStackItem[] = [
      { name: "nginx", category: "Server", version: "1.22", confidence: 80 },
      { name: "nginx", category: "Server", version: "1.24", confidence: 60 },
    ];
    render(<TechStackDetail data={items} />);
    expect(screen.getAllByText("Server")).toHaveLength(1);
    expect(screen.getAllByText("nginx").length).toBe(2);
    expect(screen.getByText("Version 1.22")).toBeInTheDocument();
    expect(screen.getByText("Version 1.24")).toBeInTheDocument();
  });

  it("renders a Technology Distribution card and per-item confidence bars", () => {
    const items: TechStackItem[] = [
      { name: "WordPress", category: "CMS", confidence: 95 },
      { name: "nginx", category: "Web Server", confidence: 65 },
      { name: "ImpressionTool", category: "Analytics", confidence: 30 },
    ];
    render(<TechStackDetail data={items} />);

    expect(screen.getByText("Technology Distribution")).toBeInTheDocument();
    expect(screen.getByText("95%")).toBeInTheDocument();
    expect(screen.getByText("65%")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByLabelText("Confidence 95%")).toBeInTheDocument();
  });
});
