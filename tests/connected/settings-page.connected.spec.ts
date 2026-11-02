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

  test("mobile section picker keeps every settings area reachable", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await navigateTo(page, "/dashboard/settings");

    const sectionPicker = page.getByRole("combobox", { name: "Settings" });
    await expect(sectionPicker).toBeVisible();
    await expect(sectionPicker.locator("option")).toHaveCount(7);
    await sectionPicker.selectOption("notifications");
    await expect(page.getByText("Webhook URL")).toBeVisible();

    const channelTabs = page.getByRole("group", { name: "Notification channels" });
    await expect(channelTabs).toHaveCSS("display", "grid");
    const tabsBox = await channelTabs.boundingBox();
    expect(tabsBox).not.toBeNull();
    for (const tab of await channelTabs.getByRole("button").all()) {
      const tabBox = await tab.boundingBox();
      expect(tabBox).not.toBeNull();
      expect((tabBox?.x ?? 0) + (tabBox?.width ?? 0)).toBeLessThanOrEqual(
        (tabsBox?.x ?? 0) + (tabsBox?.width ?? 0)
      );
      expect((tabBox?.y ?? 0) + (tabBox?.height ?? 0)).toBeLessThanOrEqual(
        (tabsBox?.y ?? 0) + (tabsBox?.height ?? 0)
      );
    }

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasHorizontalOverflow).toBe(false);
    for (const width of [768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (width < 1024) {
        await expect(sectionPicker).toBeVisible();
      } else {
        await expect(page.getByRole("navigation", { name: "Settings" })).toBeVisible();
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
      ).toBe(false);
    }
  });
});
