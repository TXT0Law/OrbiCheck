import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ReportScheduleHistory } from "@/components/report/report-schedule-history";
import { APPEARANCE_KEYS } from "@/lib/mock-data";
import type { ReportScheduleRun } from "@/shared/types/report";

const api = vi.hoisted(() => ({ listReportScheduleRuns: vi.fn(), getReportScheduleRun: vi.fn() }));
vi.mock("@/lib/api/report-schedules", () => api);
const run: ReportScheduleRun = {
  id: "requested-run-outside-list", scheduleId: "schedule", reportId: "report-id", status: "delivering",
  startedAt: null, completedAt: null, errorMessage: "delivery_unconfirmed", deliverySummary: null,
  operations: { artifactState: "completed", reportId: "report-id", deliveryState: "unconfirmed",
    channels: [{ channel: "email", state: "unknown", acceptedCount: 1, failedCount: 0, unknownCount: 1 }],
    reviewReason: "delivery_unconfirmed" },
};
function show(runId: string | null = run.id) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ReportScheduleHistory scheduleId="schedule" scheduleName="Weekly report" runId={runId} onClose={vi.fn()} /></QueryClientProvider>);
}
beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); });
it("fetches and focuses requested run outside history cap, with uncertainty and report link", async () => {
  api.listReportScheduleRuns.mockResolvedValue({ runs: [] });
  api.getReportScheduleRun.mockResolvedValue(run);
  show();
  expect(await screen.findByText("Requested execution")).toBeInTheDocument();
  expect(api.getReportScheduleRun).toHaveBeenCalledWith("schedule", run.id);
  expect(screen.getByText(/1 accepted · 0 failed · 1 unconfirmed/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open report" })).toHaveAttribute("href", "/dashboard/reports/report-id");
  expect(screen.getAllByText("Not recorded")).toHaveLength(2);
  expect(screen.getByText(/delivery may already have been accepted/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("Requested execution").closest("article")?.parentElement).toHaveFocus());
});
it("separates query error from empty and retries the query in Traditional Chinese", async () => {
  localStorage.setItem(APPEARANCE_KEYS.language, "zh");
  api.listReportScheduleRuns.mockRejectedValueOnce(new Error("unavailable"));
  show(null);
  expect(await screen.findByRole("alert")).toHaveTextContent("無法載入執行歷史");
  expect(screen.queryByText("尚無執行記錄。")).not.toBeInTheDocument();
  api.listReportScheduleRuns.mockResolvedValue({ runs: [] });
  fireEvent.click(screen.getByRole("button", { name: "重試查詢" }));
  expect(await screen.findByText("尚無執行記錄。")).toBeInTheDocument();
});
