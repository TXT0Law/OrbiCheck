import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CertValidityProgress } from "@/components/scan/charts/cert-validity-progress";

describe("CertValidityProgress", () => {
  it("renders the days remaining label and percentage when data is available", () => {
    render(<CertValidityProgress daysRemaining={180} />);

    expect(screen.getByText("180 days remaining")).toBeInTheDocument();
    expect(screen.getByText("49% of 365d window")).toBeInTheDocument();
  });

  it("falls back to the empty state when daysRemaining is missing", () => {
    render(<CertValidityProgress daysRemaining={null} />);

    expect(
      screen.getByText(/Validity progress unavailable/i),
    ).toBeInTheDocument();
  });

  it("colours the bar red when below the warn threshold", () => {
    const { container } = render(
      <CertValidityProgress daysRemaining={3} />,
    );

    const bar = container.querySelector("div.h-full");
    expect(bar?.className).toContain("bg-red-600");
  });

  it("colours the bar amber inside the warn band", () => {
    const { container } = render(
      <CertValidityProgress daysRemaining={20} />,
    );

    const bar = container.querySelector("div.h-full");
    expect(bar?.className).toContain("bg-amber-500");
  });

  it("colours the bar green when comfortably above the warn threshold", () => {
    const { container } = render(
      <CertValidityProgress daysRemaining={300} />,
    );

    const bar = container.querySelector("div.h-full");
    expect(bar?.className).toContain("bg-emerald-500");
  });

  it("shows an explicit Expired label when daysRemaining hits zero", () => {
    render(<CertValidityProgress daysRemaining={0} />);

    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("clamps the percentage between 0 and 100 even when daysRemaining > totalDays", () => {
    render(
      <CertValidityProgress daysRemaining={500} totalDays={365} />,
    );

    expect(screen.getByText("100% of 365d window")).toBeInTheDocument();
  });
});
