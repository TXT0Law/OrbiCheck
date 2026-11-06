import { expect, test } from "@playwright/test";
import type { UrlGroup, UrlGroupRun } from "@/types/url-group";

import { navigateTo } from "./helpers";

const FIXTURE_TIMESTAMP = "2026-11-06T00:00:00Z";
const COMPLETE_PROGRESS = 100;
const RECOVERY_TIMEOUT_MS = 15_000;
const group: UrlGroup = {
  id: "group-stream-recovery", name: "Stream recovery fixture", description: null,
  memberCount: 1, createdAt: FIXTURE_TIMESTAMP, updatedAt: FIXTURE_TIMESTAMP,
};
const runningRun: UrlGroupRun = {
  id: "run-stream-recovery", groupId: group.id, userId: null, status: "running",
  progress: 0, totalMembers: 1, queuedMembers: 0, runningMembers: 1,
  completedMembers: 0, failedMembers: 0, cancelledMembers: 0, skippedMembers: 0,
  concurrencyLimit: 1, errorMessage: null, createdAt: FIXTURE_TIMESTAMP,
  startedAt: FIXTURE_TIMESTAMP, completedAt: null,
  members: [{
    id: "run-member-stream-recovery", groupMemberId: "member-stream-recovery",
    url: "https://stream-recovery.example.test", scanId: null, status: "running",
    errorMessage: null, createdAt: FIXTURE_TIMESTAMP, startedAt: FIXTURE_TIMESTAMP,
    completedAt: null,
  }],
};
const completedRun: UrlGroupRun = {
  ...runningRun, status: "completed", progress: COMPLETE_PROGRESS,
  runningMembers: 0, completedMembers: 1, completedAt: FIXTURE_TIMESTAMP,
  members: runningRun.members.map((member) => ({ ...member, status: "completed", completedAt: FIXTURE_TIMESTAMP })),
};

test("group scan action recovers through REST polling after progress stream disconnects", async ({ page }) => {
  let runReads = 0;
  let terminalAvailable = false;
  await page.addInitScript(() => {
    class ControlledEventSource {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(url: string) {
        if (!url.includes("/url-groups/")) return;
        window.addEventListener("test-group-progress", (event) => {
          this.onmessage?.(new MessageEvent("message", { data: (event as CustomEvent<string>).detail }));
        });
        window.addEventListener("test-group-disconnect", () => this.onerror?.());
        document.documentElement.dataset.groupStreamReady = "true";
      }
      // Keep callbacks available to reproduce messages already queued at close time.
      close() {}
    }
    Object.defineProperty(window, "EventSource", { value: ControlledEventSource });
  });
  await page.route((url) => url.pathname === "/api/v1/url-groups", (route) => route.fulfill({
    json: { status: "success", data: { groups: [group], total: 1 } },
  }));
  await page.route((url) => url.pathname === `/api/v1/url-groups/${group.id}/runs`, (route) => {
    if (route.request().method() !== "GET") return route.abort();
    runReads += 1;
    return route.fulfill({ json: { status: "success", data: { runs: [terminalAvailable ? completedRun : runningRun], total: 1 } } });
  });
  await navigateTo(page, "/dashboard/scan/groups");
  const scanAction = page.getByRole("button", { name: "Scan Group", exact: true });
  await expect(scanAction).toBeDisabled();
  await expect(page.locator("html")).toHaveAttribute("data-group-stream-ready", "true");
  await page.evaluate((run) => window.dispatchEvent(new CustomEvent("test-group-progress", { detail: JSON.stringify(run) })), runningRun);
  const readsBeforeDisconnect = runReads;
  await page.evaluate(() => window.dispatchEvent(new Event("test-group-disconnect")));
  await expect.poll(() => runReads).toBeGreaterThan(readsBeforeDisconnect);
  await expect(scanAction).toBeDisabled();

  // The immediate disconnect refresh is still active. Only a later poll sees completion.
  terminalAvailable = true;
  await page.evaluate((run) => window.dispatchEvent(new CustomEvent("test-group-progress", { detail: JSON.stringify(run) })), runningRun);
  await expect(scanAction).toBeEnabled({ timeout: RECOVERY_TIMEOUT_MS });
  await page.evaluate((run) => window.dispatchEvent(new CustomEvent("test-group-progress", { detail: JSON.stringify(run) })), runningRun);
  await expect(scanAction).toBeEnabled();
});
