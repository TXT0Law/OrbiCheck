"use client";

import {
  Bell,
  ChevronDown,
  Database,
  Key,
  Palette,
  Shield,
  SlidersHorizontal,
  User,
} from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { getDashboardMessages } from "@/lib/i18n/dashboard";

interface SettingsNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const NAV_ITEMS = [
  { id: "appearance", labelKey: "navAppearance", icon: Palette },
  { id: "api-keys", labelKey: "navApiKeys", icon: Key },
  { id: "profile", labelKey: "navProfile", icon: User },
  { id: "scan-defaults", labelKey: "navScanDefaults", icon: SlidersHorizontal },
  { id: "notifications", labelKey: "navNotifications", icon: Bell },
  { id: "security", labelKey: "navSecurity", icon: Shield },
  { id: "data-privacy", labelKey: "navDataPrivacy", icon: Database },
] as const;

export function SettingsNav({ activeTab, onTabChange }: SettingsNavProps) {
  const language = useAppearanceLanguage();
  const messages = getDashboardMessages(language).settings;

  return (
    <div className="w-full lg:w-[220px] lg:shrink-0">
      <div className="relative lg:hidden">
        <select
          aria-label={messages.title}
          value={activeTab}
          onChange={(event) => {
            const tab = event.target.value;
            if (NAV_ITEMS.some((item) => item.id === tab)) onTabChange(tab);
          }}
          className="h-11 w-full appearance-none rounded-lg border border-zinc-200 bg-white px-4 pr-10 text-sm font-medium text-zinc-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus-visible:ring-zinc-500"
        >
          {NAV_ITEMS.map((item) => (
            <option key={item.id} value={item.id}>
              {messages[item.labelKey]}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
        />
      </div>

      <nav aria-label={messages.title} className="hidden space-y-1 lg:block">
        {NAV_ITEMS.map((item, index) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <div key={item.id}>
              <button
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-white"
                    : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800/50 dark:hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{messages[item.labelKey]}</span>
              </button>

              {index === 2 ? <Separator className="my-2" /> : null}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
