import { expect, test } from "@playwright/test";

import { navigateTo } from "./helpers";

test.describe("Connected settings page", () => {
  test("switches tabs and saves notification settings", async ({ page }) => {
    await navigateTo(page, "/dashboard/settings");
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true })
    ).toBeVisible();

    await page.getByRole("button", { name: "Appearance" }).click();
    await expect(page.getByText("Theme")).toBeVisible();

    await page.getByRole("button", { name: "API Keys" }).click();
    await expect(
      page.getByRole("heading", { name: "API Keys", exact: true })
    ).toBeVisible();

    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(page.getByText("Webhook URL")).toBeVisible();

    await page
      .getByLabel("Webhook URL")
      .fill("https://hooks.example.com/orbicheck");
    await page.getByRole("button", { name: "Save notification settings" }).click();

    await expect(page.getByText("Notification settings saved")).toBeVisible({
      timeout: 30_000,
    });
  });
});
