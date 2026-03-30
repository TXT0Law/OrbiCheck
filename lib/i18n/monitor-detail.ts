import type { AppearanceLanguage } from "@/lib/hooks/use-appearance-language";

export type MonitorDetailMessages = {
  overviewTitle: string;
  uptimeTitle: string;
  sslTitle: string;
  visualTitle: string;
  visualIntro: string;
  settingsTitle: string;
  settingsIntro: string;
  settingsCapabilityHeading: string;
  capabilityEnabledBadge: string;
  capabilityDisabledBadge: string;
};

const en: MonitorDetailMessages = {
  overviewTitle: "Overview",
  uptimeTitle: "Availability",
  sslTitle: "SSL Certificate",
  visualTitle: "Visual changes",
  visualIntro:
    "Headless screenshots via the Scan Service (Playwright). Each successful check stores a PNG; dHash similarity below your threshold creates a visual change event. Bot walls and scanner timeouts may produce empty history until a clean capture succeeds.",
  settingsTitle: "Monitor settings",
  settingsIntro: "Global targets, intervals, and per-capability thresholds.",
  settingsCapabilityHeading: "Capability configuration",
  capabilityEnabledBadge: "Enabled",
  capabilityDisabledBadge: "Disabled",
};

const zh: MonitorDetailMessages = {
  overviewTitle: "總覽",
  uptimeTitle: "可用性",
  sslTitle: "SSL 憑證",
  visualTitle: "畫面變更",
  visualIntro:
    "透過 Scan Service（Playwright）做無頭截圖。每次成功檢查會儲存 PNG；若與前一張的 dHash 相似度低於您設定的門檻，會產生視覺變更事件。若目標有機器人驗證或掃描逾時，在成功擷取前歷史可能為空。",
  settingsTitle: "監控設定",
  settingsIntro: "全域目標、檢查間隔與各能力的門檻。",
  settingsCapabilityHeading: "能力設定",
  capabilityEnabledBadge: "已啟用",
  capabilityDisabledBadge: "已停用",
};

export function getMonitorDetailMessages(lang: AppearanceLanguage): MonitorDetailMessages {
  return lang === "zh" ? zh : en;
}

/** PDF export for content-change timeline (mirror backend MONITOR_CHANGES_EXPORT_PDF_ENABLED). */
export function isMonitorChangesPdfExportEnabledInUi(): boolean {
  return (
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_MONITOR_CHANGES_EXPORT_PDF === "1"
  );
}
