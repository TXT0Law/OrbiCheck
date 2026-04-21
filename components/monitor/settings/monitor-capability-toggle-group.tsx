"use client";

import {
  Activity,
  Check,
  FileCode,
  Globe,
  Image,
  ScrollText,
  Shield,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { CAPABILITY_CONFIG } from "@/shared/constants/monitor";
import { MONITOR_CAPABILITIES, type MonitorCapability } from "@/shared/types/monitor";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Activity,
  FileCode,
  Shield,
  Image,
  Globe,
  ScrollText,
};

interface MonitorCapabilityToggleGroupProps {
  value: MonitorCapability[];
  onChange: (capabilities: MonitorCapability[]) => void;
  error?: string;
}

export function MonitorCapabilityToggleGroup({
  value,
  onChange,
  error,
}: MonitorCapabilityToggleGroupProps) {
  function toggle(cap: MonitorCapability) {
    if (value.includes(cap)) {
      if (value.length <= 1) return;
      onChange(value.filter((c) => c !== cap));
    } else {
      onChange([...value, cap]);
    }
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-zinc-900 dark:text-white">
        Monitoring capabilities{" "}
        <span className="font-normal text-zinc-600 dark:text-zinc-300">(select at least one)</span>
      </span>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MONITOR_CAPABILITIES.map((cap) => {
          const config = CAPABILITY_CONFIG[cap];
          const Icon = ICON_MAP[config.icon];
          const selected = value.includes(cap);
          const isComingSoon = Boolean(
            "comingSoon" in config &&
              (config as { comingSoon?: boolean }).comingSoon
          );

          return (
            <button
              key={cap}
              type="button"
              onClick={() => !isComingSoon && toggle(cap)}
              disabled={isComingSoon}
              className={cn(
                "relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-all",
                selected
                  ? "border-sky-500 bg-sky-500/10"
                  : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500",
                isComingSoon && "cursor-not-allowed opacity-50"
              )}
            >
              {selected ? (
                <div className="absolute right-2 top-2">
                  <Check className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                </div>
              ) : null}
              {Icon ? (
                <Icon
                  className={cn(
                    "h-6 w-6",
                    selected ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground"
                  )}
                />
              ) : null}
              <span className="text-sm font-medium text-zinc-900 dark:text-white">{config.shortLabel}</span>
              <span className="text-[11px] leading-snug text-zinc-600 dark:text-zinc-300">
                {isComingSoon ? "Coming soon" : config.description}
              </span>
            </button>
          );
        })}
      </div>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
