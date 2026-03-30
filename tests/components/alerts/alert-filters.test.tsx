import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AlertFilters,
  type AlertFilterValue,
} from "@/components/alerts/alert-filters";
import { getAlertContentMessages } from "@/lib/i18n/alert-content";

describe("AlertFilters", () => {
  const messages = getAlertContentMessages("en");
  const value: AlertFilterValue = {
    severity: "all",
    capability: "all",
    status: "all",
  };

  it("renders all filter options", () => {
    render(<AlertFilters value={value} messages={messages} onChange={vi.fn()} />);

    expect(screen.getByLabelText("Severity")).toBeInTheDocument();
    expect(screen.getByLabelText("Capability")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Critical" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Visual" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Suppressed" })).toBeInTheDocument();
  });

  it("selecting filters calls onChange with correct params", () => {
    const onChange = vi.fn();
    render(<AlertFilters value={value} messages={messages} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Severity"), {
      target: { value: "warning" },
    });
    expect(onChange).toHaveBeenCalledWith({
      severity: "warning",
      capability: "all",
      status: "all",
    });
  });
});
