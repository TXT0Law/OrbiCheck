"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const VALID_PERIODS = ["24h", "7d", "30d", "90d"] as const;
export type MonitorPeriod = (typeof VALID_PERIODS)[number];

const DEFAULT_PERIOD: MonitorPeriod = "24h";

/**
 * Read/write monitor time period from URL search params (shareable, survives refresh).
 */
export function useMonitorPeriod() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const raw = searchParams.get("period");
  const period: MonitorPeriod =
    raw && (VALID_PERIODS as readonly string[]).includes(raw) ? (raw as MonitorPeriod) : DEFAULT_PERIOD;

  const setPeriod = useCallback(
    (newPeriod: MonitorPeriod) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newPeriod === DEFAULT_PERIOD) {
        params.delete("period");
      } else {
        params.set("period", newPeriod);
      }
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  return { period, setPeriod } as const;
}
