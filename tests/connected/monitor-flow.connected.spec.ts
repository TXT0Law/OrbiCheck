import { expect, test } from "@playwright/test";

import { navigateTo, uniqueTestName } from "./helpers";

test.describe("Connected monitor lifecycle", () => {
  test("creates a monitor and opens enabled sub-pages", async ({ page }) => {
    const monitorName = uniqueTestName("Connected Monitor");

    await navigateTo(page, "/dashboard/monitor/new");
    await expect(
      page.getByRole("heading", { name: "Add monitor", exact: true })
    ).toBeVisible();

    await page.getByLabel("Display name").fill(monitorName);
    await page.getByLabel("URL").fill("https://example.com");
    await page.getByRole("button", { name: "Content" }).click();
    await page.getByRole("button", { name: "SSL" }).click();
    await page.getByRole("button", { name: "Visual" }).click();
    await page.getByRole("button", { name: "Create monitor" }).click();

    await expect(page).toHaveURL(/\/dashboard\/monitor\/[0-9a-f-]+$/i, {
      timeout: 30_000,
    });
    await expect(page.getByText("Back to Monitors")).toBeVisible();

    await page.getByRole("link", { name: "Availability" }).click();
    await expect(page).toHaveURL(/\/uptime$/);

    await page.getByRole("link", { name: "Content Changes" }).click();
    await expect(page).toHaveURL(/\/content$/);

    await page.getByRole("link", { name: "SSL Certificate" }).click();
    await expect(page).toHaveURL(/\/ssl$/);

    await page.getByRole("link", { name: "Visual Changes" }).click();
    await expect(page).toHaveURL(/\/visual$/);
  });
});
