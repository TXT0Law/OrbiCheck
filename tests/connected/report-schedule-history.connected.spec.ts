import { expect, test, type Page } from "@playwright/test";

import { navigateTo } from "./helpers";

const SCHEDULE_ID = "6bad1be7-c545-4814-8bbb-8deecf800001";
const OLDER_RUN_ID = "6bad1be7-c545-4814-8bbb-8deecf800002";
const REQUESTED_RUN_ID = "6bad1be7-c545-4814-8bbb-8deecf800003";
const REPORT_ID = "6bad1be7-c545-4814-8bbb-8deecf800004";
const SCAN_ID = "6bad1be7-c545-4814-8bbb-8deecf800005";
const RECORDED_AT = "2026-11-01T09:00:00Z";
const MOBILE_WIDTHS = [320, 375] as const;
const VIEWPORT_HEIGHT = 900;
const EDGE_TOLERANCE_PX = 1;
const API_PREFIX = `/api/v1/report-schedules/${SCHEDULE_ID}`;

function runFixture(id: string, pending = false) {
  return {
    id, scheduleId: SCHEDULE_ID, reportId: pending ? null : REPORT_ID,
    status: pending ? "pending" : "completed",
    startedAt: pending ? null : RECORDED_AT,
    completedAt: pending ? null : RECORDED_AT,
    errorMessage: null, deliverySummary: pending ? null : { channels: {}, success: true },
    operations: {
      artifactState: pending ? "missing" : "completed",
      reportId: pending ? null : REPORT_ID,
      deliveryState: pending ? "not_started" : "stored",
      channels: [], reviewReason: null,
    },
  };
}

// Transport fixtures intentionally isolate all scheduled work: POST never reaches
// Celery or a receiving channel. Login, page routing and client parsing stay real.
async function installFixtures(page: Page, history: "populated" | "empty" | "error") {
  const olderRun = runFixture(OLDER_RUN_ID);
  const requestedRun = runFixture(REQUESTED_RUN_ID, true);
  let requestedRunReads = 0;
  let enqueueRequests = 0;
  await page.addInitScript(() => localStorage.setItem("orbicheck_language", "zh"));
  await page.route((url) => url.pathname === "/api/v1/reports", (route) => route.fulfill({
    json: { status: "success", data: { reports: [] }, meta: { page: 1, limit: 20, total: 0 } },
  }));
  await page.route((url) => url.pathname.startsWith("/api/v1/report-schedules"), async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === `${API_PREFIX}/run-now` && request.method() === "POST") {
      enqueueRequests += 1;
      await route.fulfill({ json: { status: "success", data: { runId: REQUESTED_RUN_ID } } });
    } else if (path === `${API_PREFIX}/runs/${REQUESTED_RUN_ID}`) {
      requestedRunReads += 1;
      await route.fulfill({ json: { status: "success", data: requestedRun } });
    } else if (path === `${API_PREFIX}/runs`) {
      if (history === "error") {
        await route.fulfill({ status: 503, json: { status: "error", error: { code: "TEST_UNAVAILABLE", message: "History unavailable" } } });
      } else {
        // The requested ID remains absent even after query invalidation/polling.
        await route.fulfill({ json: { status: "success", data: { runs: history === "empty" ? [] : [olderRun] } } });
      }
    } else if (path === "/api/v1/report-schedules" && request.method() === "GET") {
      await route.fulfill({ json: { status: "success", data: { schedules: [{
        id: SCHEDULE_ID, userId: 1, name: "行動版週報", scanId: SCAN_ID,
        monitorId: null, monitorPeriod: "30d", format: "pdf", cadence: "weekly",
        timezone: "Asia/Hong_Kong", dayOfWeek: 0, dayOfMonth: null, hour: 9, minute: 0,
        deliveryChannels: [], emailRecipients: [], isEnabled: true,
        lastRunAt: RECORDED_AT, nextRunAt: RECORDED_AT, createdAt: RECORDED_AT,
        updatedAt: RECORDED_AT, recentRuns: history === "empty" ? [] : [olderRun],
      }] } } });
    } else {
      // Fail closed: a test must never publish a real scheduled report.
      await route.abort("blockedbyclient");
    }
  });
  return { requestedRunReads: () => requestedRunReads, enqueueRequests: () => enqueueRequests };
}

async function openSchedules(page: Page) {
  await navigateTo(page, "/dashboard/reports");
  await page.getByRole("button", { name: "排程", exact: true }).click();
  await expect(page.getByText("行動版週報", { exact: true })).toBeVisible();
}

test("Run now opens the exact pending run outside history, readable in Traditional Chinese on mobile", async ({ page }) => {
  const transport = await installFixtures(page, "populated");
  await page.setViewportSize({ width: MOBILE_WIDTHS[0], height: VIEWPORT_HEIGHT });
  await openSchedules(page);
  await page.getByRole("button", { name: "立即執行", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "執行歷史", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(REQUESTED_RUN_ID, { exact: true })).toBeVisible();
  await expect(dialog.getByText("指定的執行", { exact: true })).toBeVisible();
  await expect(dialog.getByText("已排入佇列", { exact: true })).toBeVisible();
  await expect(dialog.getByText("尚未開始投遞", { exact: true })).toBeVisible();
  await expect(dialog.getByText("請等待處理；若執行失敗，請檢查排程設定。", { exact: true })).toBeVisible();
  await expect(dialog.getByText(OLDER_RUN_ID, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "開啟報告", exact: true })).toHaveAttribute("href", `/dashboard/reports/${REPORT_ID}`);
  expect(transport.enqueueRequests()).toBe(1);
  expect(transport.requestedRunReads()).toBeGreaterThan(0);

  for (const width of MOBILE_WIDTHS) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    await expect.poll(async () => {
      const box = await dialog.boundingBox();
      return box !== null && box.x >= -EDGE_TOLERANCE_PX
        && box.x + box.width <= width + EDGE_TOLERANCE_PX
        && box.y >= -EDGE_TOLERANCE_PX
        && box.y + box.height <= VIEWPORT_HEIGHT + EDGE_TOLERANCE_PX;
    }).toBe(true);
    expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(dialog.getByRole("button", { name: "重新整理", exact: true })).toBeVisible();
  }
  await dialog.getByRole("button", { name: "重新整理", exact: true }).click();
  await expect(dialog.getByText(REQUESTED_RUN_ID, { exact: true })).toBeVisible();
  expect(transport.enqueueRequests()).toBe(1);
});

for (const history of ["empty", "error"] as const) {
  test(`execution history distinguishes ${history} from the other state`, async ({ page }) => {
    await installFixtures(page, history);
    await openSchedules(page);
    await page.getByRole("button", { name: "執行歷史", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "執行歷史", exact: true });
    await expect(dialog).toBeVisible();
    if (history === "empty") {
      await expect(dialog.getByText("尚無執行記錄。", { exact: true })).toBeVisible();
      await expect(dialog.getByText("無法載入執行歷史。", { exact: true })).not.toBeVisible();
    } else {
      await expect(dialog.getByText("無法載入執行歷史。", { exact: true })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "重試查詢", exact: true })).toBeVisible();
      await expect(dialog.getByText("尚無執行記錄。", { exact: true })).not.toBeVisible();
    }
  });
}
