import { expect, test } from "@playwright/test";

import { openScanPage, startScan } from "./helpers";

test.describe("Connected health and validation", () => {
  test("health connectivity via real scan list request", async ({ page }) => {
    const listResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/scans") &&
        response.request().method() === "GET" &&
        response.status() === 200
    );

    await openScanPage(page);

    const listResponse = await listResponsePromise;

    expect(listResponse.ok()).toBeTruthy();
    await expect(page.getByText("Cannot reach API", { exact: false })).toHaveCount(0);
  });

  test("validation error path renders readable UI error", async ({ page }) => {
    await openScanPage(page);

    await startScan(page, "https://");

    await expect(page.getByText('"https://": Invalid URL format')).toBeVisible();
  });
});
