import { expect, test } from "@playwright/test";

import { openScanPage, startScan } from "./helpers";

test.describe("Connected module detail navigation", () => {
  test("navigates from scan detail to linked module pages", async ({ page }) => {
    await openScanPage(page);
    await startScan(page, "example.com");

    const scanLink = page.getByRole("link", { name: "example.com" }).first();
    await expect(scanLink).toHaveAttribute(
      "href",
      /\/dashboard\/scan\/[0-9a-f-]{36}$/i,
      { timeout: 30_000 }
    );
    await scanLink.click();

    await expect(
      page.getByRole("heading", { name: "Scan Info", exact: true })
    ).toBeVisible();

    await page.getByRole("link", { name: "TLS", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/scan\/[0-9a-f-]+\/tls$/i);

    await page.getByRole("link", { name: "HSTS", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/scan\/[0-9a-f-]+\/hsts$/i);

    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "TLS Configuration", exact: true })
    ).toBeVisible();
  });
});
