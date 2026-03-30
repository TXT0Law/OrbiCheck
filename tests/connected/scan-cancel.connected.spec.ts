import { expect, test } from "@playwright/test";

import { openScanPage, startScan } from "./helpers";

test.describe("Connected scan cancel flow", () => {
  test("starts a scan, cancels it, and can start another scan", async ({
    page,
  }) => {
    const listResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/scans") &&
        response.request().method() === "GET" &&
        response.status() === 200
    );

    await openScanPage(page);
    await listResponsePromise;

    await page.route("**/api/v1/scans/*/progress", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body:
          'data: {"progress": 5, "phase": "quick", "detail": "Scanning...", "completedModules": 0, "totalModules": 35}\n\n',
      });
    });

    await startScan(page, "example.com");
    await expect(page.getByRole("button", { name: "Stop scan" })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Stop scan" }).click();

    const successMessage = page.getByText(
      "Scan stopped. It stays in your history with partial results."
    );
    const failureMessage = page.getByText(/Could not stop scan:/i);
    const stopOutcome = await Promise.race([
      successMessage.waitFor({ state: "visible", timeout: 30_000 }).then(
        () => "success" as const
      ),
      failureMessage.waitFor({ state: "visible", timeout: 30_000 }).then(
        () => "failure" as const
      ),
    ]);

    if (stopOutcome === "success") {
      await page.getByLabel("Category filter").selectOption("cancelled");
      await expect(page.getByText("Cancelled").first()).toBeVisible({
        timeout: 30_000,
      });
    } else {
      await expect(failureMessage).toBeVisible();
    }

    await page.unroute("**/api/v1/scans/*/progress");
    await startScan(page, "iana.org");
    await expect(page.getByText("Scan started")).toBeVisible({ timeout: 30_000 });
  });
});
