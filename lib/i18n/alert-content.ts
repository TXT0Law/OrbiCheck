import type { AppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import type { MonitorCapability } from "@/shared/types/monitor";

export type AlertContentMessages = {
  pageTitle: string;
  pageSubtitle: string;
  severityLabel: string;
  capabilityLabel: string;
  statusLabel: string;
  severityAll: string;
  severityInfo: string;
  severityWarning: string;
  severityCritical: string;
  capabilityAll: string;
  capabilityMap: Record<MonitorCapability, string>;
  statusAll: string;
  statusUnacknowledged: string;
  statusAcknowledged: string;
  statusSuppressed: string;
  statusActive: string;
  columns: {
    severity: string;
    monitor: string;
    capability: string;
    message: string;
    time: string;
    channels: string;
    status: string;
    actions: string;
  };
  badges: {
    acknowledged: string;
    suppressed: string;
    active: string;
  };
  actions: {
    acknowledge: string;
    acknowledging: string;
    retry: string;
    close: string;
    view: string;
    previous: string;
    next: string;
  };
  drawer: {
    title: string;
    description: string;
    monitorLink: string;
    details: string;
    thresholdConfig: string;
    actualValue: string;
    eventType: string;
    createdAt: string;
    resolvedAt: string;
    acknowledgedAt: string;
    acknowledgedBy: string;
    suppressReason: string;
    channels: string;
    noThresholdConfig: string;
    never: string;
  };
  empty: {
    title: string;
    description: string;
  };
  loading: string;
  errorTitle: string;
  errorDescription: string;
  pagination: string;
  liveToastTitle: string;
};

const en: AlertContentMessages = {
  pageTitle: "Alerts",
  pageSubtitle: "Monitor alert events and notifications",
  severityLabel: "Severity",
  capabilityLabel: "Capability",
  statusLabel: "Status",
  severityAll: "All",
  severityInfo: "Info",
  severityWarning: "Warning",
  severityCritical: "Critical",
  capabilityAll: "All",
  capabilityMap: {
    uptime_only: "Uptime",
    content_change: "Content",
    ssl_expiry: "SSL",
    visual_change: "Visual",
  },
  statusAll: "All",
  statusUnacknowledged: "Unacknowledged",
  statusAcknowledged: "Acknowledged",
  statusSuppressed: "Suppressed",
  statusActive: "Active",
  columns: {
    severity: "Severity",
    monitor: "Monitor",
    capability: "Capability",
    message: "Message",
    time: "Time",
    channels: "Channels",
    status: "Status",
    actions: "Actions",
  },
  badges: {
    acknowledged: "Acknowledged",
    suppressed: "Suppressed",
    active: "Active",
  },
  actions: {
    acknowledge: "Acknowledge",
    acknowledging: "Acknowledging...",
    retry: "Retry",
    close: "Close",
    view: "View",
    previous: "Previous",
    next: "Next",
  },
  drawer: {
    title: "Alert details",
    description: "Review full alert payload and dispatch metadata.",
    monitorLink: "Open monitor",
    details: "Details",
    thresholdConfig: "Threshold config",
    actualValue: "Actual value",
    eventType: "Event type",
    createdAt: "Created at",
    resolvedAt: "Resolved at",
    acknowledgedAt: "Acknowledged at",
    acknowledgedBy: "Acknowledged by",
    suppressReason: "Suppress reason",
    channels: "Channels",
    noThresholdConfig: "No threshold config recorded.",
    never: "Never",
  },
  empty: {
    title: "No alerts yet",
    description: "When monitor thresholds fire, alert events will appear here.",
  },
  loading: "Loading alerts...",
  errorTitle: "Unable to load alerts",
  errorDescription: "Please retry after checking your network or backend status.",
  pagination: "Page {current} of {total}",
  liveToastTitle: "New alert",
};

const zh: AlertContentMessages = {
  pageTitle: "告警",
  pageSubtitle: "查看監控告警事件與通知",
  severityLabel: "嚴重度",
  capabilityLabel: "能力",
  statusLabel: "狀態",
  severityAll: "全部",
  severityInfo: "資訊",
  severityWarning: "警告",
  severityCritical: "嚴重",
  capabilityAll: "全部",
  capabilityMap: {
    uptime_only: "可用性",
    content_change: "內容",
    ssl_expiry: "SSL",
    visual_change: "畫面",
  },
  statusAll: "全部",
  statusUnacknowledged: "未確認",
  statusAcknowledged: "已確認",
  statusSuppressed: "已抑制",
  statusActive: "待處理",
  columns: {
    severity: "嚴重度",
    monitor: "監控",
    capability: "能力",
    message: "訊息",
    time: "時間",
    channels: "渠道",
    status: "狀態",
    actions: "操作",
  },
  badges: {
    acknowledged: "已確認",
    suppressed: "已抑制",
    active: "待處理",
  },
  actions: {
    acknowledge: "確認",
    acknowledging: "確認中...",
    retry: "重試",
    close: "關閉",
    view: "查看",
    previous: "上一頁",
    next: "下一頁",
  },
  drawer: {
    title: "告警詳情",
    description: "查看完整告警內容與派送資訊。",
    monitorLink: "打開監控",
    details: "詳細資訊",
    thresholdConfig: "閾值設定",
    actualValue: "實際值",
    eventType: "事件類型",
    createdAt: "建立時間",
    resolvedAt: "解決時間",
    acknowledgedAt: "確認時間",
    acknowledgedBy: "確認人",
    suppressReason: "抑制原因",
    channels: "派送渠道",
    noThresholdConfig: "沒有記錄閾值設定。",
    never: "從未",
  },
  empty: {
    title: "暫無告警",
    description: "當監控閾值被觸發時，告警事件會顯示在這裡。",
  },
  loading: "正在載入告警...",
  errorTitle: "無法載入告警",
  errorDescription: "請檢查網路或後端狀態後再重試。",
  pagination: "第 {current} / {total} 頁",
  liveToastTitle: "新告警",
};

export function getAlertContentMessages(lang: AppearanceLanguage): AlertContentMessages {
  return lang === "zh" ? zh : en;
}
