import { expect, test } from "@playwright/test";

import { navigateTo, uniqueTestName } from "./helpers";

const RESPONSIVE_WIDTHS = [320, 768, 1024, 1440] as const;
const VIEWPORT_HEIGHT = 900;
const MOBILE_WIDTH = 320;
const MOBILE_ACTION_MIN_WIDTH = 200;

test("URL groups action stays readable on narrow screens", async ({ page }) => {
  await page.route(
    (url) => url.pathname === "/api/v1/url-groups",
    (route) => route.fulfill({
      status: 200,
      json: { status: "success", data: { groups: [], total: 0 } },
    }),
  );
  await navigateTo(page, "/dashboard/scan/groups");

  const heading = page.getByRole("heading", { name: "URL Groups", exact: true });
  const description = page.getByText("Organize URLs into groups for batch scanning and management.");
  const action = page.getByRole("button", { name: "New Group" }).first();
  await expect(heading).toBeVisible();

  for (const width of RESPONSIVE_WIDTHS) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    const headingBox = await heading.boundingBox();
    const descriptionBox = await description.boundingBox();
    const actionBox = await action.boundingBox();
    expect(headingBox).not.toBeNull();
    expect(descriptionBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    if (width === MOBILE_WIDTH) {
      expect(actionBox?.x).toBe(headingBox?.x);
      expect(actionBox?.width ?? 0).toBeGreaterThan(MOBILE_ACTION_MIN_WIDTH);
      expect(actionBox?.y ?? 0).toBeGreaterThan(
        (descriptionBox?.y ?? 0) + (descriptionBox?.height ?? 0),
      );
    } else {
      expect(actionBox?.y).toBe(headingBox?.y);
    }
  }
});

test.describe("Connected URL groups workflow", () => {
  test.setTimeout(120_000);

  test("creates a group, adds urls, starts group scan, and opens a scan link", async ({ page }) => {
    const groupName = uniqueTestName("Connected Group");

    await navigateTo(page, "/dashboard/scan/groups");
    await expect(
      page.getByRole("heading", { name: "URL Groups", exact: true })
    ).toBeVisible();

    await page.getByRole("button", { name: "New Group" }).first().click();
    await page.getByLabel("Name *").fill(groupName);
    await page.getByRole("button", { name: "Create" }).click();

    const groupButton = page.getByRole("button", { name: new RegExp(groupName) });
    await expect(groupButton).toBeVisible({ timeout: 30_000 });
    await groupButton.click();

    await page.getByRole("button", { name: /^Add URL$/ }).first().click();
    await page.getByLabel("URLs to add").fill("https://example.com\nhttps://iana.org");
    await page.getByRole("button", { name: "Add" }).click();

    await expect(page.getByText("https://example.com")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("https://iana.org")).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "Scan Group", exact: true }).click();
    await expect(page.getByText("Group scan progress")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Running", { exact: true }).first()).toBeVisible({
      timeout: 60_000,
    });

    const generatedScanLink = page
      .locator('a[href^="/dashboard/scan/"]')
      .filter({ hasText: /example\.com|iana\.org/ })
      .first();
    await expect(generatedScanLink).toBeVisible({ timeout: 120_000 });
    await generatedScanLink.click();
    await expect(page).toHaveURL(/\/dashboard\/scan\/[^/]+/);
  });
});
