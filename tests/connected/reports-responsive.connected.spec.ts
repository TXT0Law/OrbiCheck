import { expect, test } from "@playwright/test";

import { navigateTo } from "./helpers";

const RESPONSIVE_WIDTHS = [320, 768, 1024, 1440] as const;
const VIEWPORT_HEIGHT = 900;
const MOBILE_WIDTH = 320;
const MAX_SINGLE_LINE_BUTTON_HEIGHT = 44;
const MIN_EMPTY_STATE_HEIGHT = 220;

test("report actions remain readable and aligned across viewport widths", async ({ page }) => {
  await navigateTo(page, "/dashboard/reports");
  await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();

  const createSchedule = page.getByRole("button", { name: "Create Schedule" });
  const generateReport = page.getByRole("button", { name: "Generate Report" });

  for (const width of RESPONSIVE_WIDTHS) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    const scheduleBox = await createSchedule.boundingBox();
    const reportBox = await generateReport.boundingBox();
    expect(scheduleBox).not.toBeNull();
    expect(reportBox).not.toBeNull();
    expect(scheduleBox?.height ?? 0).toBeLessThanOrEqual(MAX_SINGLE_LINE_BUTTON_HEIGHT);
    expect(reportBox?.height ?? 0).toBeLessThanOrEqual(MAX_SINGLE_LINE_BUTTON_HEIGHT);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    if (width === MOBILE_WIDTH) {
      expect(scheduleBox?.x).toBe(reportBox?.x);
      expect(scheduleBox?.width).toBe(reportBox?.width);
      expect((scheduleBox?.y ?? 0) + (scheduleBox?.height ?? 0)).toBeLessThan(reportBox?.y ?? 0);
    } else {
      expect(scheduleBox?.y).toBe(reportBox?.y);
    }
  }
});

test("empty reports state stays centered and contained on mobile and desktop", async ({ page }) => {
  await page.route(
    (url) => url.pathname === "/api/v1/reports",
    (route) => route.fulfill({
      status: 200,
      json: { status: "success", data: { reports: [] }, meta: { page: 1, limit: 20, total: 0 } },
    }),
  );
  await navigateTo(page, "/dashboard/reports");

  const emptyTitle = page.getByRole("heading", { name: "No reports yet" });
  await expect(emptyTitle).toBeVisible();
  await expect(page.getByText("Invalid server response")).not.toBeVisible();
  const emptyCard = emptyTitle.locator("../..");

  for (const width of [MOBILE_WIDTH, 1024]) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    await expect(emptyTitle).toHaveCSS("text-align", "center");
    const cardBox = await emptyCard.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox?.height ?? 0).toBeGreaterThanOrEqual(MIN_EMPTY_STATE_HEIGHT);
    expect((cardBox?.x ?? 0) + (cardBox?.width ?? 0)).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
