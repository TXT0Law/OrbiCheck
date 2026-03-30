import type { MonitorCapability, MonitorCapabilities } from "../types/monitor";

// ── Status Config ──

export const MONITOR_STATUS_CONFIG = {
  up: { label: "Up", color: "green", icon: "CheckCircle", badgeVariant: "success" as const },
  down: { label: "Down", color: "red", icon: "XCircle", badgeVariant: "destructive" as const },
  degraded: { label: "Degraded", color: "yellow", icon: "AlertTriangle", badgeVariant: "warning" as const },
  paused: { label: "Paused", color: "gray", icon: "PauseCircle", badgeVariant: "secondary" as const },
  pending: { label: "Pending", color: "blue", icon: "Clock", badgeVariant: "outline" as const },
} as const;

export const CAPABILITY_STATUS_CONFIG = {
  healthy: { label: "Healthy", color: "green", dotClass: "bg-green-500" },
  warning: { label: "Warning", color: "yellow", dotClass: "bg-yellow-500" },
  critical: { label: "Critical", color: "red", dotClass: "bg-red-500" },
  disabled: { label: "Disabled", color: "gray", dotClass: "bg-gray-400" },
  pending: { label: "Pending", color: "blue", dotClass: "bg-blue-400" },
  error: { label: "Error", color: "red", dotClass: "bg-red-600" },
} as const;

// ── Capability Metadata (for form, SubNav, overview cards) ──

export const CAPABILITY_CONFIG = {
  uptime_only: {
    label: "Availability",
    shortLabel: "Uptime",
    description: "Monitor availability, status codes, and response time",
    icon: "Activity",
    subRoute: "uptime",
    navGroup: "Availability",
    color: "emerald",
  },
  content_change: {
    label: "Content Change",
    shortLabel: "Content",
    description: "Detect HTML source code modifications with diff view",
    icon: "FileCode",
    subRoute: "content",
    navGroup: "Content",
    color: "blue",
  },
  ssl_expiry: {
    label: "SSL Certificate",
    shortLabel: "SSL",
    description: "Track certificate expiration, chain, and SAN details",
    icon: "Shield",
    subRoute: "ssl",
    navGroup: "Security",
    color: "amber",
  },
  visual_change: {
    label: "Visual Change",
    shortLabel: "Visual",
    description: "Periodic headless screenshots and perceptual-hash comparison",
    icon: "Image",
    subRoute: "visual",
    navGroup: "Visual",
    color: "purple",
  },
} as const satisfies Record<
  MonitorCapability,
  {
    label: string;
    shortLabel: string;
    description: string;
    icon: string;
    subRoute: string;
    navGroup: string;
    color: string;
    comingSoon?: boolean;
  }
>;

/** @deprecated Use CAPABILITY_CONFIG */
export const CHECK_TYPE_CONFIG = CAPABILITY_CONFIG;

// ── SubNav Definition (mirrors scan-modules pattern) ──

export const MONITOR_SUB_NAV = [
  {
    key: "overview",
    label: "Overview",
    href: "",
    icon: "LayoutDashboard",
    group: null,
    alwaysVisible: true,
  },
  {
    key: "uptime_only",
    label: "Availability",
    href: "/uptime",
    icon: "Activity",
    group: "Availability",
    capability: "uptime_only" as MonitorCapability,
  },
  {
    key: "content_change",
    label: "Content Changes",
    href: "/content",
    icon: "FileCode",
    group: "Content",
    capability: "content_change" as MonitorCapability,
  },
  {
    key: "ssl_expiry",
    label: "SSL Certificate",
    href: "/ssl",
    icon: "Shield",
    group: "Security",
    capability: "ssl_expiry" as MonitorCapability,
  },
  {
    key: "visual_change",
    label: "Visual Changes",
    href: "/visual",
    icon: "Image",
    group: "Visual",
    capability: "visual_change" as MonitorCapability,
  },
  {
    key: "settings",
    label: "Settings",
    href: "/settings",
    icon: "Settings",
    group: null,
    alwaysVisible: true,
    position: "bottom" as const,
  },
] as const;

// ── Interval Options ──

export const INTERVAL_OPTIONS = [
  { value: 5, label: "Every 5 seconds" },
  { value: 10, label: "Every 10 seconds" },
  { value: 30, label: "Every 30 seconds" },
  { value: 60, label: "Every 1 minute" },
  { value: 300, label: "Every 5 minutes" },
  { value: 600, label: "Every 10 minutes" },
] as const;

// ── System Limits ──

export const MONITOR_LIMITS = {
  MAX_MONITORS_PER_USER: 50,
  MIN_INTERVAL_SECONDS: 5,
  MAX_CONTENT_SIZE_BYTES: 5 * 1024 * 1024,
  MAX_RESPONSE_TIMEOUT_MS: 30_000,
  SNAPSHOT_RETENTION_DAYS: 90,
  CHECK_HISTORY_RETENTION_DAYS: 365,
} as const;

// ── Default Capability Config (used when creating monitor without explicit config) ──

export const DEFAULT_CAPABILITIES: MonitorCapabilities = {
  uptime_only: {
    enabled: false,
    alert: { enabled: true, cooldownSeconds: 300, quietHours: null },
    thresholds: {
      maxResponseTimeMs: 5000,
      consecutiveFailures: 3,
      alertOnUnexpectedStatus: true,
    },
    intervalOverrideSeconds: null,
  },
  content_change: {
    enabled: false,
    alert: { enabled: true, cooldownSeconds: 300, quietHours: null },
    thresholds: {
      alertOnChange: true,
      minChangeSizeBytes: null,
      normalizeVolatileTokens: true,
      suppressDegradedPageChanges: true,
    },
    intervalOverrideSeconds: null,
  },
  ssl_expiry: {
    enabled: false,
    alert: { enabled: true, cooldownSeconds: 3600, quietHours: null },
    thresholds: {
      warnDaysRemaining: 30,
      criticalDaysRemaining: 7,
    },
    intervalOverrideSeconds: null,
  },
  visual_change: {
    enabled: false,
    alert: { enabled: false, cooldownSeconds: 300, quietHours: null },
    thresholds: {
      similarityThresholdPercent: 92,
      viewportWidth: 1280,
      viewportHeight: 720,
      fullPage: false,
      contentCorrelationWindowSeconds: null,
    },
    intervalOverrideSeconds: null,
  },
};
