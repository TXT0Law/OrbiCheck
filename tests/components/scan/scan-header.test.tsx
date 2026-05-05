import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  downloadJson: vi.fn(),
  pickScanDetailExportSummary: vi.fn(() => ({ ok: true })),
  pickScanFullExport: vi.fn(() => ({ ok: true, full: true })),
  downloadCsv: vi.fn(),
  pickScanModuleCsvRows: vi.fn(() => [{ module: "ssl" }]),
  getScanFullExport: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard/scan/scan-1"),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/report/report-generate-dialog", () => ({
  ReportGenerateDialog: ({
    open,
  }: {
    open: boolean;
  }) => (open ? <div>Report Dialog Open</div> : null),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/lib/utils/export-json", () => ({
  downloadJson: mocks.downloadJson,
  pickScanDetailExportSummary: mocks.pickScanDetailExportSummary,
  pickScanFullExport: mocks.pickScanFullExport,
}));

vi.mock("@/lib/utils/export-csv", () => ({
  downloadCsv: mocks.downloadCsv,
  pickScanModuleCsvRows: mocks.pickScanModuleCsvRows,
}));

vi.mock("@/lib/api/scans", () => ({
  getScanFullExport: mocks.getScanFullExport,
}));

import { ScanHeader } from "@/components/scan/scan-header";

const detail = {
  id: "scan-1",
  domain: "example.com",
  url: "https://example.com",
  status: "completed",
} as never;

afterEach(() => {
  mocks.downloadJson.mockClear();
  mocks.pickScanDetailExportSummary.mockClear();
  mocks.pickScanFullExport.mockClear();
  mocks.downloadCsv.mockClear();
  mocks.pickScanModuleCsvRows.mockClear();
  mocks.getScanFullExport.mockReset();
  mocks.toast.mockClear();
});

describe("scan header", () => {
  it("opens the generate report dialog for completed scans", () => {
    render(<ScanHeader detail={detail} />);

    fireEvent.click(screen.getByRole("button", { name: /generate report/i }));
    expect(screen.getByText("Report Dialog Open")).toBeInTheDocument();
  });

  it("disables report generation for non-completed scans", () => {
    render(
      <ScanHeader
        detail={{ ...detail, status: "running" } as never}
      />,
    );

    expect(screen.getByRole("button", { name: /generate report/i })).toBeDisabled();
  });

  it("downloads a summary JSON when the summary button is clicked", () => {
    render(<ScanHeader detail={detail} />);

    fireEvent.click(screen.getByRole("button", { name: /export summary \(json\)/i }));

    expect(mocks.pickScanDetailExportSummary).toHaveBeenCalledWith(detail);
    expect(mocks.downloadJson).toHaveBeenCalledWith(
      expect.stringContaining("summary.json"),
      { ok: true },
    );
  });

  it("fetches the full export and writes it to disk", async () => {
    mocks.getScanFullExport.mockResolvedValue({
      summary: detail,
      rawResults: {},
      exportedAt: "2026-05-05T00:00:00Z",
    });

    render(<ScanHeader detail={detail} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /export full \(json\)/i }));
    });

    await waitFor(() => {
      expect(mocks.getScanFullExport).toHaveBeenCalledWith("scan-1");
      expect(mocks.pickScanFullExport).toHaveBeenCalled();
      expect(mocks.downloadJson).toHaveBeenCalledWith(
        expect.stringContaining("full.json"),
        { ok: true, full: true },
      );
    });
  });

  it("surfaces a toast when the full export request fails", async () => {
    mocks.getScanFullExport.mockRejectedValue(new Error("network down"));

    render(<ScanHeader detail={detail} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /export full \(json\)/i }));
    });

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Export failed", variant: "destructive" }),
      );
      expect(mocks.downloadJson).not.toHaveBeenCalled();
    });
  });

  it("downloads a module-level CSV when the CSV button is clicked", () => {
    render(<ScanHeader detail={detail} />);

    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));

    expect(mocks.pickScanModuleCsvRows).toHaveBeenCalledWith(detail);
    expect(mocks.downloadCsv).toHaveBeenCalledWith(
      expect.stringContaining("modules.csv"),
      [{ module: "ssl" }],
    );
  });

  it("renders a Trend link to the per-domain timeline page", () => {
    render(<ScanHeader detail={detail} />);

    const trendLink = screen.getByRole("link", { name: /trend/i });
    expect(trendLink).toHaveAttribute("href", "/dashboard/scan/scan-1/trend");
  });
});
