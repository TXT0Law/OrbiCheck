import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useEvidenceMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/hooks/use-scan-finding-evidence", () => ({
  useScanFindingEvidence: (...args: unknown[]) => useEvidenceMock(...args),
}));

import { RiskEvidencePanel } from "@/components/scan/summary/risk-evidence-panel";

const PROPS = {
  scanId: "4e8ee7cb-3936-4892-89bf-4bc18c5053f9",
  ruleId: "ssl.certificate_expiry",
  scanStartedAt: "2026-11-01T00:00:00Z",
};

describe("RiskEvidencePanel", () => {
  beforeEach(() => {
    useEvidenceMock.mockReset();
    useEvidenceMock.mockReturnValue({ data: undefined, isFetching: false, isError: false });
  });

  it("requests raw evidence only after opening", () => {
    render(<RiskEvidencePanel {...PROPS} />);

    expect(useEvidenceMock).toHaveBeenCalledWith(PROPS.scanId, PROPS.ruleId, PROPS.scanStartedAt, false);
    expect(screen.queryByText(/Stored module output/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show raw evidence" }));

    expect(useEvidenceMock).toHaveBeenLastCalledWith(PROPS.scanId, PROPS.ruleId, PROPS.scanStartedAt, true);
    expect(screen.getByRole("button", { name: "Hide raw evidence" })).toHaveAttribute("aria-expanded", "true");
  });

  it("shows available output and explicit missing and large states", () => {
    useEvidenceMock.mockReturnValue({
      isFetching: false,
      isError: false,
      data: {
        sources: [
          { moduleName: "ssl", status: "available", rawResult: { valid: false } },
          { moduleName: "headers", status: "missing", rawResult: null },
          { moduleName: "ports", status: "too_large", rawResult: null },
        ],
      },
    });
    render(<RiskEvidencePanel {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Show raw evidence" }));

    expect(screen.getByText(/"valid": false/)).toBeInTheDocument();
    expect(screen.getByText(/Missing evidence does not mean the risk is fixed/i)).toBeInTheDocument();
    expect(screen.getByText(/Use Export full \(JSON\) above/i)).toBeInTheDocument();
  });

  it("hides stale output while refetching after invalidation", () => {
    useEvidenceMock.mockReturnValue({
      isFetching: true,
      isError: false,
      data: { sources: [{ moduleName: "ssl", status: "available", rawResult: { stale: true } }] },
    });
    render(<RiskEvidencePanel {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Show raw evidence" }));

    expect(screen.getByRole("status")).toHaveTextContent(/Loading raw evidence/i);
    expect(screen.queryByText(/"stale": true/)).not.toBeInTheDocument();
  });

  it("explains fetch errors without implying the risk cleared", () => {
    useEvidenceMock.mockReturnValue({ data: undefined, isFetching: false, isError: true });
    render(<RiskEvidencePanel {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Show raw evidence" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/does not indicate resolution/i);
  });
});
