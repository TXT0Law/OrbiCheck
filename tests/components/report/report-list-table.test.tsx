import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  downloadReport: vi.fn(),
  toast: vi.fn(),
  useDeleteReport: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  })),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api/reports", () => ({
  downloadReport: mocks.downloadReport,
}));

vi.mock("@/lib/hooks/use-reports", () => ({
  useDeleteReport: mocks.useDeleteReport,
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

import { ReportListTable } from "@/components/report/report-list-table";
import type { ReportFormat, ReportListItem } from "@/shared/types/report";

afterEach(() => {
  mocks.downloadReport.mockReset();
  mocks.toast.mockClear();
});

function buildRow(overrides: Partial<ReportListItem> = {}): ReportListItem {
  return {
    id: "report-1",
    title: "Security Report - example.com",
    format: "both",
    status: "completed",
    scanDomain: "example.com",
    fileSizeBytes: 4096,
    createdAt: "2026-05-04T00:00:00Z",
    completedAt: "2026-05-04T00:01:00Z",
    ...overrides,
  };
}

function rowFor(title: string) {
  const link = screen.getByRole("link", { name: title });
  return link.closest("tr");
}

const FORMAT_BUTTONS: Record<
  ReportFormat,
  { md: boolean; pdf: boolean; html: boolean }
> = {
  pdf: { md: true, pdf: true, html: false },
  markdown: { md: true, pdf: false, html: false },
  html: { md: true, pdf: false, html: true },
  both: { md: true, pdf: true, html: false },
  all: { md: true, pdf: true, html: true },
};

describe("ReportListTable downloads", () => {
  it.each(Object.entries(FORMAT_BUTTONS) as [ReportFormat, { md: boolean; pdf: boolean; html: boolean }][])(
    "respects FORMAT_AVAILABILITY for %s format",
    (format, expected) => {
      render(
        <ReportListTable
          reports={[buildRow({ format, title: `Report ${format}` })]}
        />,
      );

      const row = rowFor(`Report ${format}`);
      expect(row).not.toBeNull();
      const scoped = within(row as HTMLElement);

      expect(scoped.getByRole("button", { name: "MD" }).hasAttribute("disabled")).toBe(!expected.md);
      expect(scoped.getByRole("button", { name: "PDF" }).hasAttribute("disabled")).toBe(!expected.pdf);
      expect(scoped.getByRole("button", { name: "HTML" }).hasAttribute("disabled")).toBe(!expected.html);
    },
  );

  it("calls downloadReport with html when the HTML button is enabled", () => {
    render(
      <ReportListTable
        reports={[buildRow({ format: "all", title: "All-format report" })]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "HTML" }));

    expect(mocks.downloadReport).toHaveBeenCalledWith("report-1", "html");
  });

  it("disables every download button while the report is still pending", () => {
    render(
      <ReportListTable
        reports={[buildRow({ status: "pending", title: "Pending report" })]}
      />,
    );

    const row = rowFor("Pending report");
    expect(row).not.toBeNull();
    const scoped = within(row as HTMLElement);
    expect(scoped.getByRole("button", { name: "MD" })).toBeDisabled();
    expect(scoped.getByRole("button", { name: "PDF" })).toBeDisabled();
    expect(scoped.getByRole("button", { name: "HTML" })).toBeDisabled();
  });

  it("surfaces a toast when downloadReport throws", async () => {
    mocks.downloadReport.mockRejectedValueOnce(new Error("network down"));
    render(
      <ReportListTable
        reports={[buildRow({ format: "all", title: "Will fail" })]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "MD" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Download failed", variant: "destructive" }),
    );
  });
});
