#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_NEXT_DIR = path.join(PROJECT_ROOT, ".next");
const DEFAULT_ROUTE_BUDGET_KIB = 260;
const ROUTE_BUDGETS_KIB = {
  "/dashboard/monitor/[monitorId]/uptime/page": 250,
  "/dashboard/monitor/[monitorId]/ssl/page": 230,
  "/dashboard/reports/[reportId]/page": 220,
  "/dashboard/scan/[scanId]/ssl/page": 220,
  "/dashboard/scan/[scanId]/trend/page": 220,
};
const BYTES_PER_KIB = 1024;

export async function calculateRouteSizes(nextDir = DEFAULT_NEXT_DIR) {
  const manifestPath = path.join(nextDir, "app-build-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const compressedSizeCache = new Map();
  const routeSizes = new Map();

  for (const [route, files] of Object.entries(manifest.pages ?? {})) {
    if (!route.endsWith("/page")) {
      continue;
    }

    const javascriptFiles = [...new Set(files.filter((file) => file.endsWith(".js")))];
    let gzipBytes = 0;
    for (const file of javascriptFiles) {
      if (!compressedSizeCache.has(file)) {
        const contents = await readFile(path.join(nextDir, file));
        compressedSizeCache.set(file, gzipSync(contents).byteLength);
      }
      gzipBytes += compressedSizeCache.get(file);
    }
    routeSizes.set(route, gzipBytes / BYTES_PER_KIB);
  }

  return routeSizes;
}

export function evaluateBudgets(
  routeSizes,
  defaultBudgetKib = DEFAULT_ROUTE_BUDGET_KIB,
  routeBudgetsKib = ROUTE_BUDGETS_KIB,
) {
  return [...routeSizes.entries()]
    .map(([route, gzipKib]) => {
      const budgetKib = routeBudgetsKib[route] ?? defaultBudgetKib;
      return { route, gzipKib, budgetKib };
    })
    .filter(({ gzipKib, budgetKib }) => gzipKib > budgetKib)
    .sort((left, right) => right.gzipKib - left.gzipKib);
}

async function main() {
  await stat(path.join(DEFAULT_NEXT_DIR, "app-build-manifest.json"));
  const routeSizes = await calculateRouteSizes();
  const failures = evaluateBudgets(routeSizes);

  if (failures.length > 0) {
    console.error("Bundle budget exceeded:");
    for (const { route, gzipKib, budgetKib } of failures) {
      console.error(`  ${route}: ${gzipKib.toFixed(1)} KiB > ${budgetKib} KiB`);
    }
    process.exitCode = 1;
    return;
  }

  const largestRoutes = [...routeSizes.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);
  console.log("Bundle budgets passed. Largest routes:");
  for (const [route, gzipKib] of largestRoutes) {
    console.log(`  ${route}: ${gzipKib.toFixed(1)} KiB gzip`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
