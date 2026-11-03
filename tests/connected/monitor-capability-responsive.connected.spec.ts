import { expect, test } from "@playwright/test";

import { navigateTo } from "./helpers";

const RESPONSIVE_WIDTHS = [320, 768, 1024, 1440] as const;
const VIEWPORT_HEIGHT = 900;
const DNS_DESCRIPTION = "Detect changes in A/AAAA/CNAME/MX/NS/TXT/CAA records";

test("monitor capability descriptions stay within their cards", async ({ page }) => {
  await navigateTo(page, "/dashboard/monitor/new");
  const description = page.getByText(DNS_DESCRIPTION, { exact: true });
  await expect(description).toBeVisible();
  const card = description.locator("..");

  for (const width of RESPONSIVE_WIDTHS) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    const descriptionBox = await description.boundingBox();
    const cardBox = await card.boundingBox();
    if (!descriptionBox || !cardBox) {
      throw new Error("DNS capability description or card was not rendered");
    }
    expect(descriptionBox.x).toBeGreaterThanOrEqual(cardBox.x);
    expect(descriptionBox.x + descriptionBox.width).toBeLessThanOrEqual(
      cardBox.x + cardBox.width
    );
    expect(descriptionBox.y + descriptionBox.height).toBeLessThanOrEqual(
      cardBox.y + cardBox.height
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
