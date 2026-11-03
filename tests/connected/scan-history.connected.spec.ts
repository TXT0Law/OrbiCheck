import { expect, test } from "@playwright/test";

import { openScanPage, startScan } from "./helpers";

test.describe("Connected scan history", () => {
  test("keeps scan filters inside the viewport on tablet and phone", async ({ page }) => {
    await openScanPage(page);

    for (const width of [1024, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const searchButton = page.getByRole("button", { name: "Search", exact: true });
      await expect(searchButton).toBeVisible();

      const rightEdge = await searchButton.evaluate(
        (button) => button.getBoundingClientRect().right
      );
      const documentWidth = await page.evaluate(
        () => document.documentElement.scrollWidth
      );

      expect(rightEdge).toBeLessThanOrEqual(width);
      expect(documentWidth).toBeLessThanOrEqual(width);
    }
  });

  test("shows scan list rows and navigates to detail", async ({ page }) => {
    await openScanPage(page);
    await expect(
      page.getByRole("heading", { name: "Scan List", exact: true })
    ).toBeVisible();

    await startScan(page, "example.com");

    const scanLink = page.getByRole("link", { name: "example.com" }).first();
    await expect(scanLink).toHaveAttribute(
      "href",
      /\/dashboard\/scan\/[0-9a-f-]{36}$/i,
      { timeout: 30_000 }
    );

    await scanLink.click();
    await expect(page).toHaveURL(/\/dashboard\/scan\/[0-9a-f-]{36}$/i);
    await expect(
      page.getByRole("heading", { name: "Scan Info", exact: true })
    ).toBeVisible();
  });
});
