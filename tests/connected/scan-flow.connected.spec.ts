import { expect, test } from "@playwright/test";

import { openScanPage, startScanAndGetId } from "./helpers";

test.describe("Connected happy scan flow", () => {
  test("starts scan and renders backend result detail", async ({ page }) => {
    test.setTimeout(60_000);

    await openScanPage(page);

    let scanId: string | null = null;
    try {
      scanId = await startScanAndGetId(page, "example.com");
    } catch (error) {
      const existingScanLink = page.getByRole("link", { name: "example.com" }).first();
      await expect(existingScanLink).toHaveAttribute(
        "href",
        /\/dashboard\/scan\/[0-9a-f-]{36}$/i,
        { timeout: 30_000 }
      );
      scanId = new URL(await existingScanLink.getAttribute("href") ?? "", page.url())
        .pathname
        .split("/")
        .pop() ?? null;
      if (!scanId) {
        throw error;
      }
    }

    await page.goto(`/dashboard/scan/${scanId}`);

    await expect(page).toHaveURL(/\/dashboard\/scan\/[0-9a-f-]{36}$/i);

    await expect(page.getByRole("heading", { name: "Scan Info", exact: true })).toBeVisible();
    await expect(page.getByText("https://example.com", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Security score", { exact: true })).toBeVisible();
    await expect(page.getByText("18", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/^completed$/i).first()).toBeVisible();
  });
});
