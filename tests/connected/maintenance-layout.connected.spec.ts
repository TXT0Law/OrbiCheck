import { expect, test } from "@playwright/test";

import { navigateTo } from "./helpers";

const VIEWPORT_WIDTHS = [320, 768, 1024, 1440] as const;
const VIEWPORT_HEIGHT = 900;
const MOBILE_WIDTH = 320;
const MOBILE_TITLE_MIN_WIDTH = 150;
const WINDOW_TITLE = "Planned_database_maintenance_for_primary_customer_facing_region";

test("maintenance window details fit a narrow screen", async ({ page }) => {
  await page.route(
    (url) => url.pathname === "/api/v1/maintenance-windows",
    (route) => route.fulfill({
      status: 200,
      json: {
        status: "success",
        data: [{
          id: "maintenance-1",
          userId: 1,
          monitorId: "monitor-primary-customer-facing-region",
          title: WINDOW_TITLE,
          startsAt: "2026-11-03T10:00:00.000Z",
          endsAt: "2026-11-03T11:00:00.000Z",
          suppressAlerts: true,
          suppressProbes: true,
          isEnabled: false,
          notes: "Customer-facing_primary_region_upgrade",
          recurrence: null,
          tagScope: ["customer-facing-production-region"],
          createdAt: "2026-11-01T00:00:00.000Z",
          updatedAt: "2026-11-01T00:00:00.000Z",
        }],
      },
    }),
  );
  await navigateTo(page, "/dashboard/settings/maintenance");
  const title = page.getByText(WINDOW_TITLE, { exact: true });
  await expect(title).toBeVisible();
  const card = page.getByRole("listitem").filter({ has: title });

  for (const width of VIEWPORT_WIDTHS) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    const titleBox = await title.boundingBox();
    const cardBox = await card.boundingBox();
    expect(titleBox).not.toBeNull();
    expect(cardBox).not.toBeNull();
    expect((titleBox?.x ?? 0) + (titleBox?.width ?? 0)).toBeLessThanOrEqual(
      (cardBox?.x ?? 0) + (cardBox?.width ?? 0),
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    if (width === MOBILE_WIDTH) {
      const statusBox = await card.getByText("Disabled").boundingBox();
      expect(statusBox).not.toBeNull();
      expect(titleBox?.width ?? 0).toBeGreaterThan(MOBILE_TITLE_MIN_WIDTH);
      expect(statusBox?.y ?? 0).toBeGreaterThanOrEqual(
        (titleBox?.y ?? 0) + (titleBox?.height ?? 0),
      );
    }
  }
});
