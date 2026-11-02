import { expect, test } from "@playwright/test";

import { navigateTo } from "./helpers";

test("dashboard card headers honor their layout direction", async ({ page }) => {
  await navigateTo(page, "/dashboard");

  const recentScansHeader = page.getByText("Recent Scans", { exact: true }).locator("..");
  const quickScanHeader = page.getByText("Quick Scan", { exact: true }).locator("..");

  await expect(recentScansHeader).toHaveCSS("flex-direction", "row");
  await expect(quickScanHeader).toHaveCSS("flex-direction", "column");
});

test("quick scan keeps its content height beside a taller monitor card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/v1/monitors?**", () => {});
  await navigateTo(page, "/dashboard");

  const quickScanCard = page.getByText("Quick Scan", { exact: true }).locator("../..");
  const monitorCard = page.getByText("Monitor Health", { exact: true }).locator("../..");
  const cardsRow = quickScanCard.locator("..");

  await expect(cardsRow).toHaveCSS("align-items", "flex-start");
  await expect(quickScanCard).toBeVisible();
  await expect(monitorCard).toBeVisible();

  const quickScanHeight = (await quickScanCard.boundingBox())?.height ?? 0;
  const monitorHeight = (await monitorCard.boundingBox())?.height ?? 0;
  expect(quickScanHeight).toBeLessThan(monitorHeight);
});
