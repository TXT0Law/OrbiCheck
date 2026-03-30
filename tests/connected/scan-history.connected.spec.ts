import { expect, test } from "@playwright/test";

import { openScanPage, startScan } from "./helpers";

test.describe("Connected scan history", () => {
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
