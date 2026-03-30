import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MonitorDetailProviderSkeleton } from "@/components/monitor/monitor-detail-provider-skeleton";

describe("MonitorDetailProviderSkeleton", () => {
  it("renders structural placeholders", () => {
    const { container } = render(<MonitorDetailProviderSkeleton />);
    expect(container.querySelector(".min-h-screen")).toBeTruthy();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(3);
  });
});
