import { expect, test } from "@playwright/test";

import { navigateTo } from "./helpers";

test("dashboard card headers honor their layout direction", async ({ page }) => {
  await navigateTo(page, "/dashboard");

  const recentScansHeader = page.getByText("Recent Scans", { exact: true }).locator("..");
  const quickScanHeader = page.getByText("Quick Scan", { exact: true }).locator("..");

  await expect(recentScansHeader).toHaveCSS("flex-direction", "row");
  await expect(quickScanHeader).toHaveCSS("flex-direction", "column");
});
