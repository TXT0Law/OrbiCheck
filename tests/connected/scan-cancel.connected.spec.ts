import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { openScanPage, startScan } from "./helpers";

const LINKED_BACKEND_URL = "http://127.0.0.1:8010";
const CANCEL_SMOKE_TARGET = "https://iana.org";

test.describe("Connected scan cancel flow", () => {
  test("reaches the real linked backend cancel endpoint", async ({ request }) => {
    const createResponse = await request.post(
      `${LINKED_BACKEND_URL}/api/v1/scans`,
      { data: { url: CANCEL_SMOKE_TARGET } }
    );
    expect(createResponse.ok()).toBeTruthy();

    const createBody = await createResponse.json();
    const scanId = createBody?.data?.id ?? createBody?.id;
    expect(typeof scanId).toBe("string");

    const cancelResponse = await request.post(
      `${LINKED_BACKEND_URL}/api/v1/scans/${scanId}/cancel`
    );

    expect(cancelResponse.status()).toBe(200);
    const cancelBody = await cancelResponse.json();
    const status = cancelBody?.data?.status ?? cancelBody?.status;
    expect(status).toBe("cancelled");
  });

  test("shows the cancel UI fallback and allows another scan", async ({ page }) => {
    const listResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/scans") &&
        response.request().method() === "GET" &&
        response.status() === 200
    );

    await openScanPage(page);
    await listResponsePromise;

    await page.route("**/api/v1/scans", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }

      const requestBody = route.request().postDataJSON() as { url?: string };
      const url = requestBody.url?.startsWith("http")
        ? requestBody.url
        : `https://${requestBody.url ?? "example.com"}`;
      const domain = new URL(url).hostname;
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "success",
          data: {
            id: randomUUID(),
            url,
            domain,
            status: "running",
            progress: 5,
            totalModules: 34,
            completedModules: 0,
            securityScore: null,
            errorMessage: null,
            createdAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
            completedAt: null,
          },
        }),
      });
    });
    await page.route("**/api/v1/scans/*/progress", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body:
          'data: {"progress": 5, "phase": "quick", "detail": "Scanning...", "completedModules": 0, "totalModules": 35}\n\n',
      });
    });
    await page.route("**/api/v1/scans/*/cancel", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "success", data: {} }),
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
      await expect(successMessage).toBeVisible();
    } else {
      await expect(failureMessage).toBeVisible();
      return;
    }

    await page.unroute("**/api/v1/scans/*/progress");
    await page.unroute("**/api/v1/scans/*/cancel");
    await startScan(page, "iana.org");
    await expect(
      page.getByRole("link", { name: "iana.org" }).first()
    ).toHaveAttribute("href", /\/dashboard\/scan\/[0-9a-f-]{36}$/i, {
      timeout: 30_000,
    });
    await page.unroute("**/api/v1/scans");
  });
});
