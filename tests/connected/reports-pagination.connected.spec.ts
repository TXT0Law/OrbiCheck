import { expect, test } from "@playwright/test";

import { reportListItemSchema } from "../../shared/schemas/report";
import type { ReportListItem } from "../../shared/types/report";

import { navigateTo } from "./helpers";

const FIRST_PAGE = 1;
const PAGE_SIZE = 20;
const REPORT_COUNT = 25;
const FIRST_REPORT_NUMBER = 1;
const NEXT_REPORT_OFFSET = 1;

const reports = Array.from({ length: REPORT_COUNT }, (_, index) => ({
  id: `pagination-report-${index + FIRST_REPORT_NUMBER}`,
  title: `Pagination report ${index + FIRST_REPORT_NUMBER}`,
  format: "pdf",
  status: "completed",
  scanId: null,
  scanDomain: null,
  fileSizeBytes: null,
  createdAt: "2026-10-27T00:00:00Z",
  completedAt: "2026-10-27T00:01:00Z",
} satisfies ReportListItem));

reports.forEach((report) => reportListItemSchema.parse(report));

test("reaches all 25 reports across pages and returns to cached first-page results", async ({ page }) => {
  await page.route((url) => url.pathname === "/api/v1/reports", (route) => {
    const requestedPage = Number(new URL(route.request().url()).searchParams.get("page") ?? FIRST_PAGE);
    const offset = (requestedPage - FIRST_PAGE) * PAGE_SIZE;
    return route.fulfill({ json: {
      status: "success",
      data: { reports: reports.slice(offset, offset + PAGE_SIZE) },
      meta: { page: requestedPage, limit: PAGE_SIZE, total: REPORT_COUNT },
    } });
  });
  await navigateTo(page, "/dashboard/reports");
  await expect(page.getByText("Pagination report 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText(`Pagination report ${PAGE_SIZE + NEXT_REPORT_OFFSET}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`Pagination report ${REPORT_COUNT}`, { exact: true })).toBeVisible();
  await expect(page.getByText("Pagination report 1", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByText("Pagination report 1", { exact: true })).toBeVisible();
  await expect(page.getByText(`Pagination report ${REPORT_COUNT}`, { exact: true })).toHaveCount(0);
});

test("keeps report failure visible and recovers when the user retries", async ({ page }) => {
  let unavailable = true;
  await page.route((url) => url.pathname === "/api/v1/reports", (route) => route.fulfill(unavailable
    ? { status: 503, json: { status: "error", message: "Reports unavailable" } }
    : { json: { status: "success", data: { reports: [] }, meta: { page: FIRST_PAGE, limit: PAGE_SIZE, total: 0 } } }));
  await navigateTo(page, "/dashboard/reports");
  await expect(page.getByRole("alert").filter({ hasText: "Reports could not be loaded." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No reports yet" })).toHaveCount(0);
  unavailable = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No reports yet" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Reports could not be loaded." })).toHaveCount(0);
});
