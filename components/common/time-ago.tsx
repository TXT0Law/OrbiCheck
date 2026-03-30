"use client";

import { useEffect, useState } from "react";

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(diffSec) < 60) return rtf.format(-diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(-diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 48) return rtf.format(-diffHr, "hour");
  const diffDay = Math.round(diffHr / 24);
  if (Math.abs(diffDay) < 30) return rtf.format(-diffDay, "day");
  const diffMonth = Math.round(diffDay / 30);
  return rtf.format(-diffMonth, "month");
}

interface TimeAgoProps {
  date: string;
  className?: string;
  /** When false, show a one-shot relative label (no periodic tick). */
  live?: boolean;
}

/** Relative time from an ISO timestamp; updates every minute on the client when live. */
export function TimeAgo({ date, className = "", live = true }: TimeAgoProps) {
  const [label, setLabel] = useState(() => formatRelative(date));

  useEffect(() => {
    setLabel(formatRelative(date));
    if (!live) return;
    const id = window.setInterval(() => setLabel(formatRelative(date)), 60_000);
    return () => window.clearInterval(id);
  }, [date, live]);

  return <span className={className}>{label}</span>;
}
