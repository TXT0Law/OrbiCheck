import { expect, type Page } from "@playwright/test";

export async function openScanPage(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: "orbicheck_auth",
      value: "1",
      domain: "127.0.0.1",
      path: "/",
      sameSite: "Lax",
    },
  ]);

  await page.goto("/dashboard/scan");
  await expect(page.getByRole("heading", { name: "Scan", exact: true })).toBeVisible();
}

export async function startScan(page: Page, target: string): Promise<void> {
  await page.getByRole("textbox", { name: "Scan target URL" }).fill(target);
  await page.getByRole("button", { name: "Start Scan" }).click();
}

export async function navigateTo(page: Page, path: string): Promise<void> {
  await page.context().addCookies([
    {
      name: "orbicheck_auth",
      value: "1",
      domain: "127.0.0.1",
      path: "/",
      sameSite: "Lax",
    },
  ]);
  await page.goto(path);
}

export async function waitForScanComplete(
  page: Page,
  timeout = 60_000
): Promise<void> {
  await expect(page.getByText("completed", { exact: true }).first()).toBeVisible({
    timeout,
  });
}
