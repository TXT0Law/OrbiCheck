import { expect, test } from "@playwright/test";

import { navigateTo, uniqueTestName } from "./helpers";

const RESPONSIVE_WIDTHS = [320, 768, 1024, 1440] as const;
const VIEWPORT_HEIGHT = 900;
const MOBILE_WIDTH = 320;
const MOBILE_ACTION_MIN_WIDTH = 200;

test("URL groups action stays readable on narrow screens", async ({ page }) => {
  await page.route(
    (url) => url.pathname === "/api/v1/url-groups",
    (route) => route.fulfill({
      status: 200,
      json: { status: "success", data: { groups: [], total: 0 } },
    }),
  );
  await navigateTo(page, "/dashboard/scan/groups");

  const heading = page.getByRole("heading", { name: "URL Groups", exact: true });
  const description = page.getByText("Organize URLs into groups for batch scanning and management.");
  const action = page.getByRole("button", { name: "New Group" }).first();
  await expect(heading).toBeVisible();

  for (const width of RESPONSIVE_WIDTHS) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    const headingBox = await heading.boundingBox();
    const descriptionBox = await description.boundingBox();
    const actionBox = await action.boundingBox();
    expect(headingBox).not.toBeNull();
    expect(descriptionBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    if (width === MOBILE_WIDTH) {
      expect(actionBox?.x).toBe(headingBox?.x);
      expect(actionBox?.width ?? 0).toBeGreaterThan(MOBILE_ACTION_MIN_WIDTH);
      expect(actionBox?.y ?? 0).toBeGreaterThan(
        (descriptionBox?.y ?? 0) + (descriptionBox?.height ?? 0),
      );
    } else {
      expect(actionBox?.y).toBe(headingBox?.y);
    }
  }
});

test.describe("Connected URL groups workflow", () => {
  test.setTimeout(120_000);

  test("creates a group, adds urls, starts group scan, and opens a scan link", async ({ page }) => {
    const groupName = uniqueTestName("Connected Group");

    await navigateTo(page, "/dashboard/scan/groups");
    await expect(
      page.getByRole("heading", { name: "URL Groups", exact: true })
    ).toBeVisible();

    await page.getByRole("button", { name: "New Group" }).first().click();
    await page.getByLabel("Name *").fill(groupName);
    await page.getByRole("button", { name: "Create" }).click();

    const groupButton = page.getByRole("button", { name: new RegExp(groupName) });
    await expect(groupButton).toBeVisible({ timeout: 30_000 });
    await groupButton.click();

    await groupButton.getByRole("button", { name: /^Add URL$/ }).click();
    await page.getByLabel("URLs to add").fill("https://example.com\nhttps://iana.org");
    await page.getByRole("button", { name: "Add" }).click();

    await expect(page.getByText("https://example.com")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("https://iana.org")).toBeVisible({
      timeout: 30_000,
    });

    await groupButton.getByRole("button", { name: "Scan Group", exact: true }).click();
    await expect(page.getByText("Group scan progress")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Running", { exact: true }).first()).toBeVisible({
      timeout: 60_000,
    });

    const generatedScanLink = page
      .locator('a[href^="/dashboard/scan/"]')
      .filter({ hasText: /example\.com|iana\.org/ })
      .first();
    await expect(generatedScanLink).toBeVisible({ timeout: 120_000 });
    await generatedScanLink.click();
    await expect(page).toHaveURL(/\/dashboard\/scan\/[^/]+/);
  });
});


test("member URL search finds a collapsed group and cleared description persists", async ({ page }) => {
  const groupName = uniqueTestName("Search and edit group");
  const memberUrl = `https://${groupName.toLowerCase().replace(/[^a-z0-9]/g, "")}.example.test`;
  await navigateTo(page, "/dashboard/scan/groups");
  await page.getByRole("button", { name: "New Group" }).first().click();
  await page.getByLabel("Name *").fill(groupName);
  await page.getByLabel("Description (optional)").fill("Description to clear");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const group = page.getByRole("button", { name: new RegExp(groupName) });
  await expect(group).toBeVisible();
  await group.getByRole("button", { name: /^Add URL$/ }).click();
  await page.getByLabel("URLs to add").fill(memberUrl);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await group.locator('button[aria-haspopup="menu"]').click();
  await page.getByRole("button", { name: "Edit Group", exact: true }).click();
  await page.getByLabel("Description (optional)").fill("");
  const update = page.waitForResponse((response) => response.url().includes("/url-groups/") && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect((await update).ok()).toBe(true);
  await page.reload();
  const persistedGroup = page.getByRole("button", { name: new RegExp(groupName) });
  await persistedGroup.locator('button[aria-haspopup="menu"]').click();
  await page.getByRole("button", { name: "Edit Group", exact: true }).click();
  await expect(page.getByLabel("Description (optional)")).toHaveValue("");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.goto("/dashboard/scan");
  await page.getByRole("button", { name: "By Group", exact: true }).click();
  await expect(page).toHaveURL(/[?&]view=group(?:&|$)/);
  const search = page.getByRole("textbox", { name: "Search scans", exact: true });
  await search.fill(memberUrl);
  await search.press("Enter");
  await expect(page).toHaveURL((url) => url.searchParams.get("view") === "group" && url.searchParams.get("search") === memberUrl);
  await expect(page.getByRole("button", { name: new RegExp(groupName) })).toBeVisible();
  await page.reload();
  await expect(search).toHaveValue(memberUrl);
  await expect(page).toHaveURL((url) => url.searchParams.get("view") === "group" && url.searchParams.get("search") === memberUrl);
  await expect(page.getByRole("button", { name: new RegExp(groupName) })).toBeVisible();
});

test("Add URL persists a bracketed IPv6 member after reload", async ({ page }) => {
  const groupName = uniqueTestName("IPv6 member group");
  const memberUrl = "https://[2001:db8::1]:8443/path?value=test";
  await navigateTo(page, "/dashboard/scan/groups");
  await page.getByRole("button", { name: "New Group" }).first().click();
  await page.getByLabel("Name *").fill(groupName);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const group = page.getByRole("button", { name: new RegExp(groupName) });
  await expect(group).toBeVisible();
  await group.getByRole("button", { name: /^Add URL$/ }).click();
  await page.getByLabel("URLs to add").fill(memberUrl);
  const submission = page.waitForResponse((response) =>
    response.url().includes("/url-groups/") &&
    response.url().endsWith("/members") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const response = await submission;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toEqual({ url: memberUrl });
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  const persistedGroup = page.getByRole("button", { name: new RegExp(groupName) });
  await expect(persistedGroup).toBeVisible();
  await persistedGroup.click();
  await expect(page.getByText(memberUrl, { exact: true })).toBeVisible();
});
