import { expect, test } from "@playwright/test";

import { navigateTo, uniqueTestName } from "./helpers";

test.describe("Connected URL groups workflow", () => {
  test("creates a group, adds a url, and triggers scan", async ({ page }) => {
    const groupName = uniqueTestName("Connected Group");

    await navigateTo(page, "/dashboard/scan/groups");
    await expect(
      page.getByRole("heading", { name: "URL Groups", exact: true })
    ).toBeVisible();

    await page.getByRole("button", { name: "New Group" }).click();
    await page.getByLabel("Name *").fill(groupName);
    await page.getByRole("button", { name: "Create" }).click();

    const groupButton = page.getByRole("button", { name: new RegExp(groupName) });
    await expect(groupButton).toBeVisible({ timeout: 30_000 });
    await groupButton.click();

    await page.getByRole("button", { name: /^Add URL$/ }).first().click();
    await page.getByLabel("URLs to add").fill("https://example.com");
    await page.getByRole("button", { name: "Add" }).click();

    await expect(page.getByText("https://example.com")).toBeVisible({
      timeout: 30_000,
    });
  });
});
