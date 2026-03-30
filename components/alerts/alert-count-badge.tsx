"use client";

import { useAlerts } from "@/lib/hooks/use-alerts";

const POLL_INTERVAL_MS = 60_000;
const MAX_BADGE_COUNT = 99;

export function AlertCountBadge() {
  const { data } = useAlerts(
    {
      limit: 0,
      acknowledged: false,
      suppressed: false,
    },
    {
      refetchInterval: POLL_INTERVAL_MS,
      staleTime: POLL_INTERVAL_MS,
    }
  );

  const count = data?.meta?.total ?? 0;

  if (count <= 0) {
    return null;
  }

  return (
    <span
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white"
      aria-label={`${count} unacknowledged alerts`}
    >
      {count > MAX_BADGE_COUNT ? "99+" : count}
    </span>
  );
}
