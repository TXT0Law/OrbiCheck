import { defineConfig } from "@playwright/test";
import linked from "./playwright.config";
import backendDown from "./playwright.backend-down.config";

const suite = process.env.LOCAL_REGRESSION_SUITE;
const baseURL = process.env.LOCAL_REGRESSION_BASE_URL;
const outputDir = process.env.LOCAL_REGRESSION_OUTPUT;
if (!baseURL || !/^http:\/\/localhost:\d+$/.test(baseURL) || !outputDir ||
    (suite !== "linked" && suite !== "backend-down")) {
  throw new Error("Use python3 scripts/dev/local-regression.py to run this configuration");
}
const base = suite === "linked" ? linked : backendDown;
export default defineConfig({
  ...base,
  outputDir,
  forbidOnly: true,
  reporter: [["list"]],
  retries: 0,
  webServer: [],
  use: { ...base.use, baseURL },
  projects: base.projects!.map((project) => ({
    ...project,
    use: { ...project.use, baseURL },
  })),
});
