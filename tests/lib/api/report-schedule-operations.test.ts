import { expect, it } from "vitest";
import { reportScheduleRunSchema } from "@/shared/schemas/report";

it("rejects a run without typed operational evidence", () => {
  expect(reportScheduleRunSchema.safeParse({ id: "r", scheduleId: "s", reportId: null,
    status: "completed", startedAt: null, completedAt: null, errorMessage: null,
    deliverySummary: {} }).success).toBe(false);
});
