import {
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";

const CONNECTED_AUTH_EMAIL = "admin@orbicheck.local";
const CONNECTED_AUTH_PASSWORD = "linked-test-password";
const CSRF_COOKIE_PATTERN = /orbicheck_csrf=([^;]+)/;

export async function authenticateRequest(
  request: APIRequestContext,
  apiBaseUrl = "/api/v1"
): Promise<string> {
  const response = await request.post(`${apiBaseUrl}/auth/login`, {
    data: {
      email: CONNECTED_AUTH_EMAIL,
      password: CONNECTED_AUTH_PASSWORD,
    },
  });
  expect(response.ok()).toBe(true);

  const setCookieHeader = response.headers()["set-cookie"] ?? "";
  const csrfCookie = setCookieHeader.match(CSRF_COOKIE_PATTERN)?.[1];
  expect(csrfCookie).toBeTruthy();
  return decodeURIComponent(csrfCookie ?? "");
}

export async function authenticate(page: Page): Promise<void> {
  await authenticateRequest(page.request);
}

export async function openScanPage(page: Page): Promise<void> {
  await authenticate(page);
  await page.goto("/dashboard/scan");
  await expect(page.getByRole("heading", { name: "Scan", exact: true })).toBeVisible();
}

export async function openScanPageWithoutBackend(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: "orbicheck_auth",
      value: "backend-unavailable",
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

export async function startScanAndGetId(page: Page, target: string): Promise<string> {
  const createScanResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/scans") &&
      response.request().method() === "POST" &&
      response.status() >= 200 &&
      response.status() < 300,
    { timeout: 10_000 }
  );

  await startScan(page, target);

  const body: unknown = await (await createScanResponse).json();
  const payload = unwrapDataPayload(body);
  const scanId = payload.id;

  if (typeof scanId !== "string") {
    throw new Error("Connected scan response did not include a scan id");
  }

  return scanId;
}

export async function navigateTo(page: Page, path: string): Promise<void> {
  await authenticate(page);
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

export function uniqueTestName(prefix: string): string {
  return `${prefix} ${randomUUID()}`;
}

function unwrapDataPayload(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    return {};
  }
  const data = body.data;
  return isRecord(data) ? data : body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
