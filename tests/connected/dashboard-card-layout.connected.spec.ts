import { expect, test } from "@playwright/test";

import { navigateTo } from "./helpers";

const COMPACT_DESKTOP_WIDTH = 1024;
const COMPACT_DESKTOP_HEIGHT = 900;
const MIN_QUICK_SCAN_INPUT_WIDTH = 240;
const RESPONSIVE_WIDTHS = [320, 768, 1024, 1440] as const;

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

test("quick scan URL stays usable in the compact desktop grid", async ({ page }) => {
  await page.setViewportSize({ width: COMPACT_DESKTOP_WIDTH, height: COMPACT_DESKTOP_HEIGHT });
  await navigateTo(page, "/dashboard");

  const quickScanCard = page.getByText("Quick Scan", { exact: true }).locator("../..");
  await expect(quickScanCard).toBeVisible();
  const input = quickScanCard.locator("input");
  const inputBox = await input.boundingBox();
  const cardBox = await quickScanCard.boundingBox();
  expect(inputBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  expect(inputBox?.width ?? 0).toBeGreaterThanOrEqual(MIN_QUICK_SCAN_INPUT_WIDTH);
  expect((inputBox?.x ?? 0) + (inputBox?.width ?? 0)).toBeLessThanOrEqual(
    (cardBox?.x ?? 0) + (cardBox?.width ?? 0)
  );

  for (const width of RESPONSIVE_WIDTHS) {
    await page.setViewportSize({ width, height: COMPACT_DESKTOP_HEIGHT });
    const formBox = await quickScanCard.locator("form").boundingBox();
    const resizedInputBox = await input.boundingBox();
    expect(formBox).not.toBeNull();
    expect(resizedInputBox).not.toBeNull();
    expect((resizedInputBox?.x ?? 0) + (resizedInputBox?.width ?? 0)).toBeLessThanOrEqual(
      (formBox?.x ?? 0) + (formBox?.width ?? 0)
    );
  }
});

test("SSL watchlist loading rows stay inside the card at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.route("**/api/v1/monitors?**", () => {});
  await navigateTo(page, "/dashboard");

  const watchlistCard = page
    .getByText("SSL Expiry Watchlist", { exact: true })
    .locator("../..");
  await expect(watchlistCard).toBeVisible();

  const firstRow = watchlistCard.locator(".grid").first();
  const rowBox = await firstRow.boundingBox();
  expect(rowBox).not.toBeNull();
  const rowRight = (rowBox?.x ?? 0) + (rowBox?.width ?? 0);

  for (const skeleton of await firstRow.locator(".animate-pulse").all()) {
    const box = await skeleton.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(rowRight);
  }
});

test("recent scans loading rows stay inside the card at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.route("**/api/v1/scans?**", () => {});
  await navigateTo(page, "/dashboard");

  const recentScansCard = page.getByText("Recent Scans", { exact: true }).locator("../..");
  await expect(recentScansCard).toBeVisible();

  const firstRow = recentScansCard.locator(".flex.items-center.gap-3").first();
  const rowBox = await firstRow.boundingBox();
  expect(rowBox).not.toBeNull();
  const rowRight = (rowBox?.x ?? 0) + (rowBox?.width ?? 0);

  for (const skeleton of await firstRow.locator(".animate-pulse").all()) {
    const box = await skeleton.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(rowRight);
  }
});
