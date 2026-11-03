import { expect, test } from "@playwright/test";

import { navigateTo } from "./helpers";

test("loads the real report preview chunk and renders Markdown in the browser", async ({ page }) => {
  const reportId = "report-preview-regression";
  const title = "Report preview regression";
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route(`**/api/v1/reports/${reportId}`, (route) => route.fulfill({
    json: { status: "success", data: {
      id: reportId, title, format: "markdown", status: "completed",
      scanId: null, monitorId: null, monitorPeriod: null,
      fileSizeBytes: null, errorMessage: null,
      createdAt: "2026-10-27T00:00:00Z", completedAt: "2026-10-27T00:01:00Z",
    } },
  }));
  await page.route(`**/api/v1/reports/${reportId}/preview`, (route) => route.fulfill({
    json: { status: "success", data: {
      id: reportId, title, status: "completed",
      contentMd: "# Verified preview\n\nReport body\n\n| Check | Result |\n| --- | --- |\n| TLS | Passed |",
      reportMeta: null,
    } },
  }));
  await page.route(`**/api/v1/reports/${reportId}/events**`, (route) => route.fulfill({
    json: { status: "success", data: { events: [] } },
  }));

  await navigateTo(page, `/dashboard/reports/${reportId}`);

  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Markdown Preview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Verified preview" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Passed" })).toBeVisible();
  await expect(page.getByText("Loading Markdown preview…")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
