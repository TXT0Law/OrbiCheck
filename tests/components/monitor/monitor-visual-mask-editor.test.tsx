import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MonitorVisualMaskEditor } from "@/components/monitor/monitor-visual-mask-editor";

describe("MonitorVisualMaskEditor (V-11)", () => {
  it("renders the empty-state message when no regions are configured", () => {
    render(
      <MonitorVisualMaskEditor regions={[]} onChange={() => {}} maxRegions={8} />
    );
    expect(
      screen.getByText(/No ignore regions configured/i)
    ).toBeInTheDocument();
  });

  it("appends a default region when Add region is clicked", () => {
    const onChange = vi.fn();
    render(
      <MonitorVisualMaskEditor regions={[]} onChange={onChange} maxRegions={8} />
    );
    fireEvent.click(screen.getByTestId("mask-add-region"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ x: 25, y: 25, width: 25, height: 25 });
  });

  it("disables the Add region button once at capacity", () => {
    const regions = Array.from({ length: 8 }, () => ({
      x: 1,
      y: 1,
      width: 5,
      height: 5,
    }));
    render(
      <MonitorVisualMaskEditor regions={regions} onChange={() => {}} maxRegions={8} />
    );
    const addBtn = screen.getByTestId("mask-add-region");
    expect(addBtn).toBeDisabled();
  });

  it("clamps numeric input to the 0-100 percent range", () => {
    const onChange = vi.fn();
    render(
      <MonitorVisualMaskEditor
        regions={[{ x: 10, y: 10, width: 20, height: 20 }]}
        onChange={onChange}
        maxRegions={8}
      />
    );
    fireEvent.change(screen.getByTestId("mask-region-0-x"), {
      target: { value: "150" },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ x: 100 }),
    ]);
    fireEvent.change(screen.getByTestId("mask-region-0-width"), {
      target: { value: "-30" },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ width: 0 }),
    ]);
  });

  it("removes a region when the trash icon is clicked", () => {
    const onChange = vi.fn();
    render(
      <MonitorVisualMaskEditor
        regions={[
          { x: 10, y: 10, width: 5, height: 5 },
          { x: 20, y: 20, width: 5, height: 5 },
        ]}
        onChange={onChange}
        maxRegions={8}
      />
    );
    fireEvent.click(screen.getByTestId("mask-region-0-remove"));
    expect(onChange).toHaveBeenCalledWith([
      { x: 20, y: 20, width: 5, height: 5 },
    ]);
  });
});
