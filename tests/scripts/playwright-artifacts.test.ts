// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@playwright/test", () => ({
  defineConfig: <T>(config: T) => config,
  devices: { "Desktop Chrome": {} },
}));

const FIXTURE_TIMEOUT_MS = 30_000;
const TEST_RESULTS_ROOT = "test-results";
const REPORTS_ROOT = "playwright-report";
const EVIDENCE_ROOT = path.join("quickstart", "logs");
const SENTINEL_CONTENT = "retain evidence from another validation run";
const require = createRequire(import.meta.url);
const cli = require.resolve("@playwright/test/cli");
const playwright = require.resolve("@playwright/test");
const fixtures: string[] = [];
let configs: Array<{ name: string; outputDir?: string; reporter?: unknown }>;

function isDescendant(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

beforeAll(async () => {
  vi.stubEnv("CI", "true");
  const linked = (await import("../../playwright.config")).default;
  const down = (await import("../../playwright.backend-down.config")).default;
  configs = [{ name: "linked", ...linked }, { name: "backend-down", ...down }];
  vi.unstubAllEnvs();
});

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    if (!isDescendant(tmpdir(), fixture)) throw new Error("Unsafe fixture cleanup path");
    await rm(fixture, { recursive: true });
  }
});

describe("Playwright artifact isolation", () => {
  it("keeps configured artifact paths when running the CI package entry point", async () => {
    const manifest = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
    const command = manifest.scripts["test:linked:ci"] as string;
    expect(command).toContain("--config=playwright.config.ts");
    expect(command).toContain("--config=playwright.backend-down.config.ts");
    expect(command).not.toMatch(/--(?:reporter|output)(?:=|\s)/);
  });

  it("gives each suite distinct output and HTML report directories", () => {
    const outputs = configs.map((config) => config.outputDir);
    expect(outputs.every((output) => output && isDescendant(TEST_RESULTS_ROOT, output))).toBe(true);
    expect(new Set(outputs).size).toBe(configs.length);
    const reports = configs.map((config) => {
      const html = (config.reporter as Array<[string, { outputFolder?: string }]>).find(
        ([name]) => name === "html",
      );
      return html?.[1].outputFolder;
    });
    expect(reports.every((report) => report && isDescendant(REPORTS_ROOT, report))).toBe(true);
    expect(new Set(reports).size).toBe(configs.length);
    for (const directory of [...outputs, ...reports]) {
      expect(isDescendant(directory!, EVIDENCE_ROOT)).toBe(false);
      expect(isDescendant(EVIDENCE_ROOT, directory!)).toBe(false);
    }
  });

  it.each(["linked", "backend-down"])("%s cleanup preserves sibling artifacts", async (name) => {
    const config = configs.find((entry) => entry.name === name)!;
    const fixture = await mkdtemp(path.join(tmpdir(), "orbicheck-artifacts-"));
    fixtures.push(fixture);
    const output = path.resolve(fixture, config.outputDir ?? TEST_RESULTS_ROOT);
    if (!isDescendant(fixture, output)) throw new Error("Unsafe runner output path");
    const sentinels = [
      path.join(fixture, TEST_RESULTS_ROOT, "baseline", "evidence.txt"),
      path.join(fixture, EVIDENCE_ROOT, "evidence.txt"),
    ];
    for (const sentinel of sentinels) {
      await mkdir(path.dirname(sentinel), { recursive: true });
      await writeFile(sentinel, SENTINEL_CONTENT);
    }
    const specs = path.join(fixture, "specs");
    await mkdir(specs);
    await writeFile(path.join(specs, "smoke.spec.js"),
      `const { test } = require(${JSON.stringify(playwright)}); test('output cleanup', () => {});`);
    const fixtureConfig = path.join(fixture, "playwright.config.cjs");
    await writeFile(fixtureConfig, `module.exports = ${JSON.stringify({
      testDir: specs, outputDir: output, reporter: "list", workers: 1,
    })};`);
    execFileSync(process.execPath, [cli, "test", "--config", fixtureConfig], {
      cwd: fixture, timeout: FIXTURE_TIMEOUT_MS, encoding: "utf8",
    });
    for (const sentinel of sentinels) {
      expect(await readFile(sentinel, "utf8")).toBe(SENTINEL_CONTENT);
    }
  }, FIXTURE_TIMEOUT_MS);
});
