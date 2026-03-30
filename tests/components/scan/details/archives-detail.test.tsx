import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ArchivesDetail } from "@/components/scan/details/archives-detail";

describe("ArchivesDetail", () => {
  it("renders archive summary and recent snapshots", () => {
    render(
      <ArchivesDetail
        data={{
          totalSnapshots: 2,
          oldestSnapshot: "2020-01-01T00:00:00.000Z",
          newestSnapshot: "2024-01-01T00:00:00.000Z",
          snapshots: [
            {
              timestamp: "2024-01-01T00:00:00.000Z",
              url: "https://web.archive.org/example",
              statusCode: 200,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Archive Summary")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/years/i)).toBeInTheDocument();
    expect(screen.getByText("https://web.archive.org/example")).toBeInTheDocument();
  });

  it("renders empty snapshot state", () => {
    render(
      <ArchivesDetail
        data={{
          totalSnapshots: 0,
          oldestSnapshot: undefined,
          newestSnapshot: undefined,
          snapshots: [],
        }}
      />,
    );

    expect(screen.getByText("No snapshots returned.")).toBeInTheDocument();
  });
});
