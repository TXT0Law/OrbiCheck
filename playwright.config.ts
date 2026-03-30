import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/connected",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [["html", { open: "never" }], ["list"]] : [["list"]],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "linked",
      testMatch: [/tests\/connected\/(?!backend-unreachable).*\.connected\.spec\.ts/],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:3101",
      },
    },
  ],
  webServer: [
    {
      command: "node server.js",
      cwd: "backend/scan",
      url: "http://127.0.0.1:4000/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "uv run python ../scripts/dev/start-linked-backend.py",
      cwd: "backend",
      env: { ...process.env, UV_LINK_MODE: "copy" },
      url: "http://127.0.0.1:8010/api/v1/health",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npx next dev --port 3101",
      env: { ...process.env, NEXT_PUBLIC_API_URL: "http://127.0.0.1:8010" },
      url: "http://127.0.0.1:3101",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
  expect: {
    timeout: 15_000,
  },
});
