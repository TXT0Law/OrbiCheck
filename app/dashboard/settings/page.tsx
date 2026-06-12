"use client";

import { useState } from "react";

import { ApiKeysSettings } from "@/components/settings/api-keys-settings";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { NotificationChannelSettings } from "@/components/settings/notification-channel-settings";
import { PlaceholderSection } from "@/components/settings/placeholder-section";
import { SettingsNav } from "@/components/settings/settings-nav";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { getDashboardMessages } from "@/lib/i18n/dashboard";

export default function SettingsPage() {
  const language = useAppearanceLanguage();
  const messages = getDashboardMessages(language).settings;
  const [activeTab, setActiveTab] = useState("appearance");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          {messages.title}
        </h1>
        <p className="mt-1 text-muted-foreground">{messages.subtitle}</p>
      </div>

      <div className="flex flex-col gap-8 md:flex-row">
        <SettingsNav activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="min-w-0 flex-1">
          {activeTab === "appearance" ? <AppearanceSettings /> : null}
          {activeTab === "api-keys" ? <ApiKeysSettings /> : null}
          {activeTab === "profile" ? (
            <PlaceholderSection
              title={messages.profileTitle}
              description={messages.profileDescription}
            />
          ) : null}
          {activeTab === "scan-defaults" ? (
            <PlaceholderSection
              title={messages.scanDefaultsTitle}
              description={messages.scanDefaultsDescription}
            />
          ) : null}
          {activeTab === "notifications" ? <NotificationChannelSettings /> : null}
          {activeTab === "security" ? (
            <PlaceholderSection
              title={messages.securityTitle}
              description={messages.securityDescription}
            />
          ) : null}
          {activeTab === "data-privacy" ? (
            <PlaceholderSection
              title={messages.dataPrivacyTitle}
              description={messages.dataPrivacyDescription}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
