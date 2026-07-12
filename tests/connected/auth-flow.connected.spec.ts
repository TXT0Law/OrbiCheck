import { expect, test } from "@playwright/test";

test.describe("Connected authentication flow", () => {
  test("guards the dashboard and enforces login, CSRF, and logout", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("Email").fill("admin@orbicheck.local");
    await page.getByLabel("Password").fill("linked-test-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    const sessionResponse = await page.request.get("/api/v1/auth/session");
    expect(sessionResponse.status()).toBe(200);

    const missingCsrfResponse = await page.request.post("/api/v1/auth/logout");
    expect(missingCsrfResponse.status()).toBe(403);

    await page.locator('button[aria-haspopup="menu"]').click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    const loggedOutResponse = await page.request.get("/api/v1/auth/session");
    expect(loggedOutResponse.status()).toBe(401);
  });
});
