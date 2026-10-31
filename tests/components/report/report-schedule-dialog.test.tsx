import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSchedule: vi.fn(async () => ({})),
  updateSchedule: vi.fn(async () => ({})),
  toast: vi.fn(),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));
vi.mock("@/lib/hooks/use-appearance-language", () => ({
  useAppearanceLanguage: () => "en",
}));
vi.mock("@/lib/hooks/use-report-schedules", () => ({
  useCreateReportSchedule: () => ({ mutateAsync: mocks.createSchedule, isPending: false }),
  useUpdateReportSchedule: () => ({ mutateAsync: mocks.updateSchedule, isPending: false }),
}));
vi.mock("@/lib/hooks/use-scan-list", () => ({
  useScanList: () => ({
    data: { scans: [{ id: "scan-1", domain: "example.com", createdAt: "2026-05-04T00:00:00Z" }] },
  }),
}));
vi.mock("@/lib/hooks/use-monitors", () => ({
  useMonitors: () => ({ data: { data: [] } }),
}));

import { ReportScheduleDialog } from "@/components/report/report-schedule-dialog";

describe("ReportScheduleDialog fresh scan option", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to existing scans and submits an explicit fresh scan choice", async () => {
    render(<ReportScheduleDialog open onOpenChange={() => undefined} />);

    const freshScan = screen.getByRole("checkbox", { name: /run a fresh scan/i });
    expect(freshScan).not.toBeChecked();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Weekly report" } });
    fireEvent.click(freshScan);
    fireEvent.click(screen.getByRole("button", { name: "Create Schedule" }));

    await waitFor(() => {
      expect(mocks.createSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ scanId: "scan-1", rescanBeforeReport: true }),
      );
    });
  });
});
