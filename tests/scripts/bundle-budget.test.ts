import { describe, expect, it } from "vitest";

import {
  calculateRouteSizes,
  evaluateBudgets,
} from "../../scripts/ci/check-bundle-budget.mjs";

describe("bundle budget checker", () => {
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
