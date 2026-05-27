import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;
const scanServicePort = 4000;
const linkedBackendPort = 8010;
const frontendPort = 3101;
const scanServiceUrl = `http://127.0.0.1:${scanServicePort}`;
const linkedBackendUrl = `http://127.0.0.1:${linkedBackendPort}`;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;

export default defineConfig({
  testDir: "./tests/connected",
  outputDir: "test-results/connected",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
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
        baseURL: frontendUrl,
      },
    },
  ],
  webServer: [
    {
      command: "node server.js",
      cwd: "backend/scan",
      url: `${scanServiceUrl}/health`,
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
    {
      command: "uv run python ../scripts/dev/start-linked-backend.py",
      cwd: "backend",
      env: { ...process.env, UV_LINK_MODE: "copy" },
      url: `${linkedBackendUrl}/api/v1/health`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: `npx next dev --port ${frontendPort}`,
      env: { ...process.env, NEXT_PUBLIC_API_URL: linkedBackendUrl },
      url: frontendUrl,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
  expect: {
    timeout: 15_000,
  },
});
