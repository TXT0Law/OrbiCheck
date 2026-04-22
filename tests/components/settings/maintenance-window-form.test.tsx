import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MaintenanceWindowForm } from "@/components/settings/maintenance-window-form";
import type { MaintenanceWindow } from "@/shared/types/monitor";

function baseWindow(overrides: Partial<MaintenanceWindow> = {}): MaintenanceWindow {
  return {
    id: "w1",
    userId: 1,
    monitorId: null,
    title: "Existing window",
    startsAt: "2026-04-21T10:00:00.000Z",
    endsAt: "2026-04-21T12:00:00.000Z",
    suppressAlerts: true,
    suppressProbes: false,
    isEnabled: true,
    notes: null,
    recurrence: null,
    tagScope: null,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("MaintenanceWindowForm", () => {
  it("submits a create payload with weekly recurrence and tag scope", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MaintenanceWindowForm
        mode="create"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/quarterly db upgrade/i), {
      target: { value: "Weekly cleanup" },
    });
    // datetime-local inputs use yyyy-MM-ddTHH:mm
    const datetimeInputs = screen
      .getAllByRole("textbox", { hidden: true })
      .concat(
        Array.from(document.querySelectorAll('input[type="datetime-local"]')) as HTMLElement[],
      );
    const dtInputs = Array.from(
      document.querySelectorAll('input[type="datetime-local"]'),
    ) as HTMLInputElement[];
    fireEvent.change(dtInputs[0], { target: { value: "2026-05-01T10:00" } });
    fireEvent.change(dtInputs[1], { target: { value: "2026-05-01T12:00" } });

    fireEvent.click(screen.getByLabelText(/repeat this window/i));
    // Weekly is the default freq
    fireEvent.click(screen.getByLabelText(/^mon$/i));
    fireEvent.click(screen.getByLabelText(/^fri$/i));

    fireEvent.change(screen.getByPlaceholderText(/prod, customer-facing/i), {
      target: { value: "prod, edge" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create window/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.title).toBe("Weekly cleanup");
    expect(payload.recurrence).toEqual({
      freq: "weekly",
      byWeekday: [0, 4],
      untilAt: null,
    });
    expect(payload.tagScope).toEqual(["prod", "edge"]);
    expect(datetimeInputs).toBeDefined();
  });

  it("emits clearRecurrence/clearTagScope flags when editing back to defaults", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MaintenanceWindowForm
        mode="edit"
        initial={baseWindow({
          recurrence: { freq: "daily", byWeekday: null, untilAt: null },
          tagScope: ["prod"],
        })}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByLabelText(/repeat this window/i));

    fireEvent.change(screen.getByPlaceholderText(/prod, customer-facing/i), {
      target: { value: "" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.recurrence).toBeNull();
    expect(payload.clearRecurrence).toBe(true);
    expect(payload.tagScope).toBeNull();
    expect(payload.clearTagScope).toBe(true);
    expect(payload.clearMonitorScope).toBe(true);
  });
});
