// @vitest-environment node

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import {
  calculateRouteSizes,
  evaluateBudgets,
} from "../../scripts/ci/check-bundle-budget.mjs";

describe("bundle budget checker", () => {
  it("keeps its hashbang importable on Windows checkouts", async () => {
    const source = await readFile(new URL("../../scripts/ci/check-bundle-budget.mjs", import.meta.url), "utf8");
    expect(source.split("\n")[0]).toBe("#!/usr/bin/env node");
  });

  it("reads actual chunks, deduplicates them per route and counts shared chunks in each route", async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), "orbicheck-bundle-"));
    const bytesPerKib = 1024;
    const shared = "shared JavaScript";
    const page = "page JavaScript";
    try {
      await mkdir(path.join(fixture, "static"));
      await writeFile(path.join(fixture, "static/shared.js"), shared);
      await writeFile(path.join(fixture, "static/page.js"), page);
      await writeFile(path.join(fixture, "app-build-manifest.json"), JSON.stringify({ pages: {
        "/first/page": ["static/shared.js", "static/shared.js", "static/page.js", "ignored.css"],
        "/second/page": ["static/shared.js"],
        "/layout": ["missing.js"],
      } }));

      expect(await calculateRouteSizes(fixture)).toEqual(new Map([
        ["/first/page", (gzipSync(shared).byteLength + gzipSync(page).byteLength) / bytesPerKib],
        ["/second/page", gzipSync(shared).byteLength / bytesPerKib],
      ]));
    } finally {
      const relative = path.relative(tmpdir(), fixture);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("Bundle fixture cleanup escaped the temporary directory");
      }
      await rm(fixture, { recursive: true });
    }
  });

  it("reports only routes that exceed their configured budget", () => {
    const failures = evaluateBudgets(
      new Map([
        ["/small/page", 120],
        ["/large/page", 240],
      ]),
      200,
      { "/large/page": 220 },
    );

    expect(failures).toEqual([
      {
        route: "/large/page",
        gzipKib: 240,
        budgetKib: 220,
      },
    ]);
  });

  it("accepts routes that stay at or below the budget", () => {
    const failures = evaluateBudgets(
      new Map([
        ["/first/page", 180],
        ["/second/page", 200],
      ]),
      200,
      {},
    );

    expect(failures).toEqual([]);
  });

  it("exports the manifest reader used by the CLI", () => {
    expect(calculateRouteSizes).toBeTypeOf("function");
  });
});
