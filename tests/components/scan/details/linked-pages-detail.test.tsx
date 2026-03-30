import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LinkedPagesDetail } from "@/components/scan/details/linked-pages-detail";

describe("LinkedPagesDetail", () => {
  it("renders internal and external links", () => {
    render(
      <LinkedPagesDetail
        data={{
          internal: [{ url: "https://example.com/about", text: "About" }],
          external: [{ url: "https://github.com/example", text: "GitHub" }],
          totalInternal: 1,
          totalExternal: 1,
        }}
      />,
    );

    expect(screen.getByText(/1 internal/i)).toBeInTheDocument();
    expect(screen.getByText("About")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
  });

  it("shows empty state for both lists", () => {
    render(
      <LinkedPagesDetail
        data={{ internal: [], external: [], totalInternal: 0, totalExternal: 0 }}
      />,
    );

    expect(screen.getAllByText("No links found.").length).toBe(2);
  });
});
