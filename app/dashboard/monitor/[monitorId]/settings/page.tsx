"use client";

import { useMonitorDetail } from "@/components/monitor/monitor-detail-context";
import { MonitorCapabilitySettingsForm } from "@/components/monitor/settings/monitor-capability-settings-form";
import { MonitorGlobalSettingsForm } from "@/components/monitor/settings/monitor-global-settings-form";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { getMonitorDetailMessages } from "@/lib/i18n/monitor-detail";
import { CAPABILITY_CONFIG } from "@/shared/constants/monitor";
import { MONITOR_CAPABILITIES } from "@/shared/types/monitor";

export default function MonitorSettingsPage() {
  const lang = useAppearanceLanguage();
  const td = getMonitorDetailMessages(lang);
  const { monitor } = useMonitorDetail();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">{td.settingsTitle}</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{td.settingsIntro}</p>
      </div>

      <MonitorGlobalSettingsForm monitor={monitor} />

      <div className="space-y-4">
        <h3 className="text-base font-medium text-zinc-900 dark:text-white">
          {td.settingsCapabilityHeading}
        </h3>
        <div className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {MONITOR_CAPABILITIES.map((cap) => {
            const capMeta = CAPABILITY_CONFIG[cap];
            const isEnabled = monitor.enabledCapabilities.includes(cap);
            return (
              <details key={cap} className="group px-4 py-2">
                <summary className="cursor-pointer list-none py-3 text-sm font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-900 dark:text-white">{capMeta.label}</span>
                      {isEnabled ? (
                        <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 dark:text-sky-200">
                          {td.capabilityEnabledBadge}
                        </span>
                      ) : (
                        <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          {td.capabilityDisabledBadge}
                        </span>
                      )}
                    </div>
                    <span className="text-zinc-400 group-open:rotate-180">▼</span>
                  </div>
                </summary>
                <div className="border-t border-zinc-100 pb-4 pt-2 dark:border-zinc-800">
                  <MonitorCapabilitySettingsForm
                    monitorId={monitor.id}
                    capability={cap}
                    config={monitor.capabilities[cap]}
                  />
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </div>
  );
}
