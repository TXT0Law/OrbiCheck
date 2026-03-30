import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/connected",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: isCI ? [["html", { open: "never" }], ["list"]] : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3102",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "backend-down",
      testMatch: [/tests\/connected\/backend-unreachable\.connected\.spec\.ts/],
    },
  ],
  webServer: {
    command: "npx next dev --port 3102",
    env: { ...process.env, NEXT_PUBLIC_API_URL: "http://127.0.0.1:65500" },
    url: "http://127.0.0.1:3102",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  expect: {
    timeout: 15_000,
  },
});
