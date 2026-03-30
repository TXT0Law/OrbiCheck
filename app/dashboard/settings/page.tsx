"use client";

import { useState } from "react";

import { ApiKeysSettings } from "@/components/settings/api-keys-settings";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { NotificationChannelSettings } from "@/components/settings/notification-channel-settings";
import { PlaceholderSection } from "@/components/settings/placeholder-section";
import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("appearance");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Settings
        </h1>
        <p className="mt-1 text-muted-foreground">Manage your account and preferences.</p>
      </div>

      <div className="flex flex-col gap-8 md:flex-row">
        <SettingsNav activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="min-w-0 flex-1">
          {activeTab === "appearance" ? <AppearanceSettings /> : null}
          {activeTab === "api-keys" ? <ApiKeysSettings /> : null}
          {activeTab === "profile" ? (
            <PlaceholderSection
              title="Profile"
              description="Manage your display name, email, and avatar."
            />
          ) : null}
          {activeTab === "scan-defaults" ? (
            <PlaceholderSection
              title="Scan Defaults"
              description="Configure default timeout, concurrency, and enabled modules for new scans."
            />
          ) : null}
          {activeTab === "notifications" ? <NotificationChannelSettings /> : null}
          {activeTab === "security" ? (
            <PlaceholderSection
              title="Security"
              description="Manage your password, two-factor authentication, and active sessions."
            />
          ) : null}
          {activeTab === "data-privacy" ? (
            <PlaceholderSection
              title="Data & Privacy"
              description="Control data retention, export your data, or delete your account."
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
