import { fireEvent, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuickScan } from "@/components/dashboard/quick-scan";

import { renderWithQueryClient } from "./test-utils";

const pushMock = vi.fn();
const createScanMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/api/scans", () => ({
  createScan: (...args: unknown[]) => createScanMock(...args),
}));

describe("QuickScan", () => {
  beforeEach(() => {
    pushMock.mockReset();
    createScanMock.mockReset();
  });

  it("starts a scan and redirects to the detail page", async () => {
    createScanMock.mockResolvedValue({ id: "scan-123" });

    renderWithQueryClient(<QuickScan />);
    fireEvent.change(screen.getByLabelText("Quick scan URL"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));

    await waitFor(() => {
      expect(createScanMock).toHaveBeenCalledWith("https://example.com", {
        enablePortScan: true,
        portScanProfile: "quick",
        acknowledgeScanAuthorization: true,
      });
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/dashboard/scan/scan-123");
    });
  });

  it("shows validation feedback for an invalid URL", async () => {
    renderWithQueryClient(<QuickScan />);
    fireEvent.change(screen.getByLabelText("Quick scan URL"), {
      target: { value: "invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));

    expect(
      await screen.findByText(/URL must have a valid domain name/i)
    ).toBeInTheDocument();
    expect(createScanMock).not.toHaveBeenCalled();
  });

  it("shows backend errors inline", async () => {
    createScanMock.mockRejectedValue(new Error("Backend unavailable"));

    renderWithQueryClient(<QuickScan />);
    fireEvent.change(screen.getByLabelText("Quick scan URL"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));

    expect(await screen.findByText("Backend unavailable")).toBeInTheDocument();
  });
});
