import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_SCAN_DETAIL } from "@/lib/mock-data";

const useScanFindingsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/hooks/use-scan-findings", () => ({
  useScanFindings: (...args: unknown[]) => useScanFindingsMock(...args),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { RiskObservationsCard } from "@/components/scan/summary/risk-observations-card";

const SCAN_ID = "4e8ee7cb-3936-4892-89bf-4bc18c5053f9";

describe("RiskObservationsCard", () => {
  beforeEach(() => {
    useScanFindingsMock.mockReset();
    useScanFindingsMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  });

  it("does not show an empty risk verdict while a scan is running", () => {
    render(<RiskObservationsCard detail={{ ...MOCK_SCAN_DETAIL, id: SCAN_ID, status: "running" }} />);

    expect(screen.getByText(/available when the scan completes/i)).toBeInTheDocument();
    expect(screen.queryByText(/No risks were observed/i)).not.toBeInTheDocument();
    expect(useScanFindingsMock).toHaveBeenCalledWith(SCAN_ID, {
      scanStatus: "running",
      scanStartedAt: MOCK_SCAN_DETAIL.scannedAt,
    });
  });

  it.each([
    ["pending", /awaiting projection/i],
    ["failed", /could not be projected/i],
    ["unavailable", /unavailable for this scan/i],
    ["ready", /No risks were observed in available module evidence/i],
  ] as const)("explains %s with no observations", (projectionStatus, message) => {
    useScanFindingsMock.mockReturnValue({
      data: { scanId: SCAN_ID, projectionStatus, projectedAt: null, observations: [] },
      isLoading: false,
      isError: false,
    });

    render(<RiskObservationsCard detail={{ ...MOCK_SCAN_DETAIL, id: SCAN_ID, status: "completed" }} />);

    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("links each finding to the module that supplied evidence", () => {
    useScanFindingsMock.mockReturnValue({
      data: {
        scanId: SCAN_ID,
        projectionStatus: "ready",
        projectedAt: "2026-11-01T00:00:00Z",
        observations: [{
          ruleId: "ssl.certificate_expiry",
          rulesetVersion: 1,
          severity: "high",
          title: "Expired certificate",
          description: "Certificate expired",
          evidenceModules: ["ssl"],
          observedAt: "2026-11-01T00:00:00Z",
        }],
      },
      isLoading: false,
      isError: false,
    });

    render(<RiskObservationsCard detail={{ ...MOCK_SCAN_DETAIL, id: SCAN_ID, status: "completed" }} />);

    expect(screen.getByText("Expired certificate")).toBeInTheDocument();
    expect(screen.getByText("Rule: ssl.certificate_expiry")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ssl" })).toHaveAttribute("href", `/dashboard/scan/${SCAN_ID}/ssl`);
    expect(screen.getByText(/Missing or skipped modules cannot establish resolution/i)).toBeInTheDocument();
  });

  it("does not treat a request failure as a clear scan", () => {
    useScanFindingsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(<RiskObservationsCard detail={{ ...MOCK_SCAN_DETAIL, id: SCAN_ID, status: "completed" }} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/does not mean risks are fixed/i);
  });
});
