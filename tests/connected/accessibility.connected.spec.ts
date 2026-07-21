import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { openScanPage } from "./helpers";

async function expectNoAccessibilityViolations(
  page: Page,
): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test.describe("Accessibility", () => {
  test("login page has no detectable axe violations", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    await expectNoAccessibilityViolations(page);
  });

  test("scan page supports keyboard skip navigation and axe", async ({ page }) => {
    await openScanPage(page);

    await page.keyboard.press("Home");
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeFocused();
    await skipLink.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();

    await expectNoAccessibilityViolations(page);
  });
});
