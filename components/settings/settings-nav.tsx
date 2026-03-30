import {
  Bell,
  Database,
  Key,
  Palette,
  Shield,
  SlidersHorizontal,
  User,
} from "lucide-react";

import { Separator } from "@/components/ui/separator";

interface SettingsNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const NAV_ITEMS = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "profile", label: "Profile", icon: User },
  { id: "scan-defaults", label: "Scan Defaults", icon: SlidersHorizontal },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "data-privacy", label: "Data & Privacy", icon: Database },
] as const;

export function SettingsNav({ activeTab, onTabChange }: SettingsNavProps) {
  return (
    <div className="w-full md:w-[220px] md:shrink-0">
      <div className="flex gap-1 overflow-x-auto pb-1 md:block md:space-y-1 md:overflow-visible md:pb-0">
        {NAV_ITEMS.map((item, index) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <div key={item.id} className="shrink-0 md:shrink">
              <button
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors md:w-full md:text-left ${
                  isActive
                    ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-white"
                    : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800/50 dark:hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{item.label}</span>
              </button>

              {index === 2 ? <Separator className="my-2 hidden md:block" /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
