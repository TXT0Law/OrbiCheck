import { expect, test } from "@playwright/test";

import { navigateTo } from "./helpers";

const MOBILE_WIDTH = 320;
const VIEWPORT_HEIGHT = 900;
const VIEWPORT_WIDTHS = [320, 768, 1024, 1440] as const;
const REPORT_ID = "layout-report";
const LONG_TITLE = "Quarterly_security_report_for_primary_customer_facing_region";
const LONG_FINDING = "https://example.com/very/long/path/with/no/breaks/and/many/segments";

test("report detail remains usable on a narrow screen", async ({ page }) => {
  await page.route(
    (url) => url.pathname === `/api/v1/reports/${REPORT_ID}`,
    (route) => route.fulfill({
      status: 200,
      json: {
        status: "success",
        data: {
          id: REPORT_ID,
          title: LONG_TITLE,
          format: "all",
          status: "completed",
          scanId: null,
          monitorId: null,
          monitorPeriod: null,
          fileSizeBytes: 4096,
          errorMessage: null,
          createdAt: "2026-11-03T00:00:00Z",
          completedAt: "2026-11-03T00:01:00Z",
        },
      },
    }),
  );
  await page.route(
    (url) => url.pathname === `/api/v1/reports/${REPORT_ID}/preview`,
    (route) => route.fulfill({
      status: 200,
      json: {
        status: "success",
        data: {
          id: REPORT_ID,
          title: LONG_TITLE,
          status: "completed",
          contentMd: `# Findings\n\n| Rule | Evidence | Severity |\n| --- | --- | --- |\n| Header | ${LONG_FINDING} | High |`,
          reportMeta: null,
        },
      },
    }),
  );
  await page.route(
    (url) => url.pathname === `/api/v1/reports/${REPORT_ID}/events`,
    (route) => route.fulfill({ status: 200, json: { status: "success", data: { events: [] } } }),
  );
  await page.setViewportSize({ width: MOBILE_WIDTH, height: VIEWPORT_HEIGHT });
  await navigateTo(page, `/dashboard/reports/${REPORT_ID}`);
  await expect(page.getByRole("heading", { name: LONG_TITLE })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Markdown Preview" })).toBeVisible();
  const title = page.getByRole("heading", { name: LONG_TITLE });
  const tableRegion = page.getByRole("region", { name: "Report table" });
  await expect(tableRegion).toBeVisible();
  for (const width of VIEWPORT_WIDTHS) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    const titleBox = await title.boundingBox();
    const tableBox = await tableRegion.boundingBox();
    expect(titleBox).not.toBeNull();
    expect(tableBox).not.toBeNull();
    expect((titleBox?.x ?? 0) + (titleBox?.width ?? 0)).toBeLessThanOrEqual(width);
    expect((tableBox?.x ?? 0) + (tableBox?.width ?? 0)).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width === MOBILE_WIDTH) {
      expect(await tableRegion.evaluate((element) => element.scrollWidth)).toBeGreaterThan(
        await tableRegion.evaluate((element) => element.clientWidth),
      );
    }
  }
});
