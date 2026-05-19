import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MonitorVisualThresholdsForm } from "@/components/monitor/settings/monitor-visual-thresholds-form";
import type { VisualThresholds } from "@/shared/types/monitor";

const baseValue: VisualThresholds = {
  similarityThresholdPercent: 92,
  viewportWidth: 1280,
  viewportHeight: 720,
  fullPage: false,
};

describe("MonitorVisualThresholdsForm", () => {
  it("keeps partial browser steps JSON editable and shows parse errors", () => {
    const onChange = vi.fn();

    render(<MonitorVisualThresholdsForm value={baseValue} onChange={onChange} />);
    fireEvent.click(screen.getByText("Browser wait and steps"));
    fireEvent.change(screen.getByTestId("visual-browser-steps-json"), {
      target: { value: "[{\"action\":" },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/invalid steps json/i);
    expect(onChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ steps: expect.anything() }),
    );
  });

  it("updates steps once the JSON array is valid", () => {
    const onChange = vi.fn();

    render(<MonitorVisualThresholdsForm value={baseValue} onChange={onChange} />);
    fireEvent.click(screen.getByText("Browser wait and steps"));
    fireEvent.change(screen.getByTestId("visual-browser-steps-json"), {
      target: { value: "[{\"action\":\"wait\",\"ms\":250}]" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ steps: [{ action: "wait", ms: 250 }] }),
    );
  });
});
