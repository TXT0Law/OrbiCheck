import { expect, test } from "@playwright/test";

import { openScanPage, startScan } from "./helpers";

test.describe("Connected backend unreachable", () => {
  test("shows user-readable network error from interceptor", async ({ page }) => {
    await openScanPage(page);

    await startScan(page, "example.com");

    await expect(
      page.getByText(
        "Failed to start scan for https://example.com: Cannot reach API",
        { exact: false }
      )
    ).toBeVisible();
  });
});
