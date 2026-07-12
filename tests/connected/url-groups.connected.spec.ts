import { expect, test } from "@playwright/test";

import { navigateTo, uniqueTestName } from "./helpers";

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
