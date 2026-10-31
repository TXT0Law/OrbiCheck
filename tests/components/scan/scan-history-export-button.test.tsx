import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScanHistoryExportButton } from "@/components/scan/scan-history-export-button";

const exportMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/hooks/use-scan-history-export", () => ({
  SCAN_HISTORY_EXPORT_LIMIT: 5_000,
  useScanHistoryExport: () => ({ mutateAsync: exportMock, isPending: false }),
}));
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

describe("ScanHistoryExportButton", () => {
  beforeEach(() => {
    exportMock.mockReset();
    toastMock.mockReset();
    exportMock.mockResolvedValue(undefined);
  });

  it("exports the applied scan filters", async () => {
    render(
      <ScanHistoryExportButton
        search="example"
        sortBy="domain_asc"
        statusGroup="completed"
        total={12}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() =>
      expect(exportMock).toHaveBeenCalledWith({
        search: "example",
        sortBy: "domain_asc",
        statusGroup: "completed",
      }),
    );
  });

  it("states the 5,000-row cap and disables empty exports", () => {
    const { rerender } = render(
      <ScanHistoryExportButton
        search=""
        sortBy="created_at_desc"
        statusGroup="all"
        total={5_001}
      />,
    );
    expect(screen.getByRole("button", { name: "Export first 5,000 (CSV)" })).toBeEnabled();

    rerender(
      <ScanHistoryExportButton
        search=""
        sortBy="created_at_desc"
        statusGroup="all"
        total={0}
      />,
    );
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  });

  it("reports download errors", async () => {
    exportMock.mockRejectedValue(new Error("HTTP 503"));
    render(
      <ScanHistoryExportButton
        search=""
        sortBy="created_at_desc"
        statusGroup="all"
        total={1}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        title: "Export failed",
        description: "HTTP 503",
        variant: "destructive",
      }),
    );
  });
});
