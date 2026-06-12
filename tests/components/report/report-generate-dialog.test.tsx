import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { APPEARANCE_KEYS } from "@/lib/mock-data";

const mocks = vi.hoisted(() => ({
  createReport: vi.fn(async (payload: unknown) => ({
    id: "report-1",
    title: "Security Report - example.com",
    format: (payload as { format?: string })?.format ?? "pdf",
    status: "pending",
  })),
  toast: vi.fn(),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/lib/hooks/use-reports", () => ({
  useCreateReport: () => ({
    mutateAsync: mocks.createReport,
    isPending: false,
  }),
}));

vi.mock("@/lib/hooks/use-scan-list", () => ({
  useScanList: () => ({
    data: {
      scans: [
        {
          id: "scan-1",
          domain: "example.com",
          createdAt: "2026-05-04T00:00:00Z",
        },
      ],
    },
  }),
}));

vi.mock("@/lib/hooks/use-monitors", () => ({
  useMonitors: () => ({ data: { data: [] } }),
}));

import { ReportGenerateDialog } from "@/components/report/report-generate-dialog";

describe("ReportGenerateDialog format options", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("offers all five format choices including html and all", () => {
    render(<ReportGenerateDialog open onOpenChange={() => undefined} />);

    const select = screen.getByLabelText("Format") as HTMLSelectElement;
    const optionLabels = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent?.trim());
    expect(optionLabels).toEqual(["pdf", "markdown", "html", "both", "all"]);
  });

  it("submits the selected format when the user clicks Generate Report", async () => {
    render(
      <ReportGenerateDialog open onOpenChange={() => undefined} presetScanId="scan-1" />,
    );

    fireEvent.change(screen.getByLabelText("Format") as HTMLSelectElement, {
      target: { value: "html" },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate report/i }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.createReport).toHaveBeenCalledWith(
      expect.objectContaining({ format: "html", scanId: "scan-1" }),
    );
  });

  it("renders generate report dialog chrome in Chinese", () => {
    localStorage.setItem(APPEARANCE_KEYS.language, "zh");

    render(<ReportGenerateDialog open onOpenChange={() => undefined} />);

    expect(screen.getByRole("heading", { name: "產生報告" })).toBeInTheDocument();
    expect(screen.getByLabelText("格式")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "產生報告" })).toBeInTheDocument();
  });
});
