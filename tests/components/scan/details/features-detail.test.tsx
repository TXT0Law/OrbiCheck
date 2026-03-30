import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { FeaturesDetail } from "@/components/scan/details/features-detail";
import type { FeaturesResult } from "@/shared/types/scan";

describe("FeaturesDetail", () => {
  it("shows empty state when no features", () => {
    render(<FeaturesDetail data={null} />);
    expect(
      screen.getByText("No feature profile data is available for this scan.")
    ).toBeInTheDocument();
  });

  it("groups features by category and renders duplicate names with stable keys", () => {
    const data: FeaturesResult = {
      features: [
        { name: "Login", detected: true, category: "Auth" },
        { name: "Login", detected: false, category: "Auth" },
        { name: "RSS", detected: true, category: "Content" },
      ],
    };
    render(<FeaturesDetail data={data} />);
    expect(screen.getByText("Auth")).toBeInTheDocument();
    const loginRows = screen.getAllByText("Login");
    expect(loginRows.length).toBe(2);
    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});
