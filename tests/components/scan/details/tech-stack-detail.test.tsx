import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

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
    expect(screen.getByText("Server")).toBeInTheDocument();
    expect(screen.getAllByText("nginx").length).toBe(2);
    expect(screen.getByText("Version 1.22")).toBeInTheDocument();
    expect(screen.getByText("Version 1.24")).toBeInTheDocument();
  });
});
