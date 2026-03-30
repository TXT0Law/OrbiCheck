import { expect, test } from "@playwright/test";

import { openScanPage, startScan } from "./helpers";

test.describe("Connected happy scan flow", () => {
  test("starts scan and renders backend result detail", async ({ page }) => {
    await openScanPage(page);

    await startScan(page, "example.com");

    const scanLink = page.getByRole("link", { name: "example.com" }).first();
    await expect(scanLink).toHaveAttribute("href", /\/dashboard\/scan\/[0-9a-f-]{36}$/i, {
      timeout: 30_000,
    });
    await scanLink.click();

    await expect(page).toHaveURL(/\/dashboard\/scan\/[0-9a-f-]{36}$/i);

    await expect(page.getByRole("heading", { name: "Scan Info", exact: true })).toBeVisible();
    await expect(page.getByText("https://example.com", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Security Score", exact: true })).toBeVisible();
    await expect(page.getByText("18", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("completed", { exact: true }).first()).toBeVisible();
  });
});
