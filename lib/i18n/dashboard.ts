import type { AppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import type { MonitorListSortField } from "@/shared/types/monitor";

export type DashboardMessages = {
  common: {
    retry: string;
    loading: string;
    viewAll: string;
    previous: string;
    next: string;
    reset: string;
    search: string;
    delete: string;
    deleting: string;
  };
  overview: {
    title: string;
    subtitle: string;
    totalScans: string;
    activeMonitors: string;
    avgUptime: string;
    activeAlerts: string;
    statsRefreshError: string;
    quickScanTitle: string;
    quickScanDescription: string;
    quickScanUrlAria: string;
    quickScanInvalidUrl: string;
    quickScanFailed: string;
    scanning: string;
    scan: string;
    recentScans: string;
    noScansYet: string;
    failedToLoadScans: string;
    securityScoreAria: (label: string) => string;
    modulesCount: (completed: number, total: number) => string;
    durationUnavailable: string;
    monitorHealth: string;
    failedToLoadMonitors: string;
    noMonitorsConfigured: string;
    addMonitor: string;
    viewAllMonitors: (count: number) => string;
    neverChecked: string;
    uptimeValue: (value: string) => string;
    uptimeUnavailable: string;
    latencyUnavailable: string;
    sslWatchlist: string;
    failedToLoadSslWatchlist: string;
    viewAllMonitorsShort: string;
    expiryUnavailable: string;
    expiredAgo: (days: number) => string;
    expiresIn: (days: number) => string;
    sslUnknown: string;
    sslExpired: string;
    sslCritical: string;
    sslWarning: string;
    sslOk: string;
    statusCompleted: string;
    statusRunning: string;
    statusFailed: string;
  };
  scan: {
    title: string;
    subtitle: string;
    stopped: string;
    stopFailed: (message: string) => string;
    startFailed: (url: string, message: string) => string;
    startFailedGeneric: string;
    scanStarted: string;
    scansStarted: (count: number) => string;
    listTitle: string;
    resultsSummary: (total: number, refreshing: boolean) => string;
    refreshing: string;
    deleteAll: string;
    deleteConfirm: string;
    deleteAllConfirm: string;
    deleteFailed: (message: string) => string;
    noScansMatchedDelete: string;
    deleteAllFailed: (message: string) => string;
    rescanFailed: (message: string) => string;
    searchAria: string;
    searchPlaceholder: string;
    sortAria: string;
    statusFilterAria: string;
    sortNewest: string;
    sortOldest: string;
    sortScoreHigh: string;
    sortScoreLow: string;
    sortDomainAsc: string;
    sortDomainDesc: string;
    sortProgressHigh: string;
    categoryAll: string;
    categoryActive: string;
    categoryCompleted: string;
    categoryFailed: string;
    categoryCancelled: string;
    noScansFound: string;
    securityLabel: string;
    rescan: string;
    rescanning: string;
    pageSummary: (page: number, totalPages: number, total: number) => string;
    rowsPerPage: string;
    rowsPerPageAria: string;
    loadingScans: string;
    statusCompleted: string;
    statusRunning: string;
    statusCancelled: string;
    statusFailed: string;
    inputPlaceholder: string;
    urlsDetected: (count: number) => string;
    urlRequired: string;
    moduleRequired: string;
    authorizationRequired: string;
    portScanning: string;
    authorizationBadge: string;
    portDescription: string;
    permissionNotice: string;
    scanDepth: string;
    portScanDepthAria: string;
    authorizationConfirm: string;
    startingScan: string;
    startScan: string;
    scanUrls: (count: number) => string;
  };
  monitor: {
    title: string;
    subtitle: string;
    addMonitor: string;
    loadingMonitors: string;
    searchPlaceholder: string;
    statusFilterAria: string;
    sortAria: string;
    allStatuses: string;
    statusUp: string;
    statusDown: string;
    statusDegraded: string;
    statusPaused: string;
    statusPending: string;
    sortDefault: string;
    sortLabels: Record<MonitorListSortField, string>;
    advancedFilters: string;
    active: string;
    tags: string;
    tagPlaceholder: string;
    removeTagAria: (tag: string) => string;
    matchAny: string;
    matchAll: string;
    maxLatency: string;
    noLimit: string;
    minUptime: string;
    noFloor: string;
    loadFailed: string;
    emptyPageRedirect: string;
    noFilterMatches: string;
    pageSummary: (page: number, totalPages: number, total: number) => string;
    rowsPerPage: string;
    rowsPerPageAria: string;
    selectAllAria: string;
    deselectAllAria: string;
    selectMonitorAria: (name: string) => string;
    tableName: string;
    tableUrl: string;
    tableCapabilities: string;
    tableStatus: string;
    tableLastCheck: string;
    tableUptime: string;
    tableLatency: string;
    tableActions: string;
    never: string;
  };
  reports: {
    title: string;
    subtitle: string;
    createSchedule: string;
    generateReport: string;
    reportsTab: string;
    schedulesTab: string;
    loadingReports: string;
    loadingSchedules: string;
    noReportsTitle: string;
    noReportsDescription: string;
    noSchedulesTitle: string;
    noSchedulesDescription: string;
    tableTitle: string;
    tableDomain: string;
    tableFormat: string;
    tableStatus: string;
    tableSize: string;
    tableCreated: string;
    tableActions: string;
    statusCompleted: string;
    statusFailed: string;
    statusGenerating: string;
    statusDelivering: string;
    statusPending: string;
    reportDeletedTitle: string;
    reportDeletedDescription: (title: string) => string;
    deleteFailedTitle: string;
    deleteReportFallback: string;
    downloadFailedTitle: string;
    downloadFailedFallback: string;
    compare: string;
    compareAvailableTitle: string;
    compareUnavailableTitle: string;
    deleteReportTitle: string;
    deleteReportDescription: (title: string) => string;
    thisReport: string;
    cancel: string;
    pleaseWait: string;
    generateDialogTitle: string;
    generateDialogDescription: string;
    scanLabel: string;
    selectCompletedScan: string;
    includeMonitorSummary: string;
    monitorLabel: string;
    selectMonitor: string;
    periodLabel: string;
    formatLabel: string;
    titleLabel: string;
    defaultReportTitle: (target: string, date: string) => string;
    scanRequiredTitle: string;
    scanRequiredDescription: string;
    reportQueuedTitle: string;
    reportQueuedDescription: (title: string) => string;
    generationFailedTitle: string;
    queueReportFallback: string;
    generating: string;
    scheduleDialogCreateTitle: string;
    scheduleDialogEditTitle: string;
    scheduleDialogDescription: string;
    nameLabel: string;
    timezoneLabel: string;
    cadenceLabel: string;
    weekly: string;
    monthly: string;
    weekdayLabel: string;
    dayLabel: string;
    hourLabel: string;
    minuteLabel: string;
    deliveryLabel: string;
    slackConfiguredChannel: string;
    noDeliveryWarning: string;
    enabledLabel: string;
    saving: string;
    saveSchedule: string;
    scheduleCreatedTitle: string;
    scheduleUpdatedTitle: string;
    scheduleReadyDescription: (name: string) => string;
    scheduleFormFallback: string;
    scheduleSaveFallback: string;
    scheduleNotSavedTitle: string;
    scheduleTableName: string;
    scheduleTableCadence: string;
    scheduleTableFormat: string;
    scheduleTableDelivery: string;
    scheduleTableLastRun: string;
    scheduleTableNextRun: string;
    scheduleTableStatus: string;
    scheduleTableActions: string;
    storeOnly: string;
    scheduleEnabledStatus: string;
    schedulePausedStatus: string;
    deliveryNeedsAttention: string;
    edit: string;
    pause: string;
    resume: string;
    runNow: string;
    schedulePausedTitle: string;
    scheduleResumedTitle: string;
    scheduleUpdatedDescription: (name: string) => string;
    updateFailedTitle: string;
    updateScheduleFallback: string;
    runQueuedTitle: string;
    runQueuedDescription: (name: string) => string;
    runFailedTitle: string;
    runScheduleFallback: string;
    scheduleDeletedTitle: string;
    scheduleDeletedDescription: (name: string) => string;
    deleteScheduleFallback: string;
    deleteScheduleTitle: string;
    deleteScheduleDescription: (name: string) => string;
    thisSchedule: string;
    weekDays: string[];
    dayOfMonth: (day: number) => string;
  };
  settings: {
    title: string;
    subtitle: string;
    navAppearance: string;
    navApiKeys: string;
    navProfile: string;
    navScanDefaults: string;
    navNotifications: string;
    navSecurity: string;
    navDataPrivacy: string;
    themeTitle: string;
    themeDescription: string;
    themeLight: string;
    themeDark: string;
    themeSystem: string;
    fontSizeTitle: string;
    fontSizeDescription: string;
    fontSmall: string;
    fontDefault: string;
    fontLarge: string;
    fontPreview: string;
    languageTitle: string;
    languageDescription: string;
    apiKeysTitle: string;
    apiKeysDescription: string;
    save: string;
    edit: string;
    test: string;
    testing: string;
    connectionSuccessful: string;
    comingSoon: string;
    profileTitle: string;
    profileDescription: string;
    scanDefaultsTitle: string;
    scanDefaultsDescription: string;
    securityTitle: string;
    securityDescription: string;
    dataPrivacyTitle: string;
    dataPrivacyDescription: string;
  };
};

const en: DashboardMessages = {
  common: {
    retry: "Retry",
    loading: "Loading...",
    viewAll: "View all",
    previous: "Previous",
    next: "Next",
    reset: "Reset",
    search: "Search",
    delete: "Delete",
    deleting: "Deleting...",
  },
  overview: {
    title: "Dashboard",
    subtitle: "Overview of your security posture.",
    totalScans: "Total Scans",
    activeMonitors: "Active Monitors",
    avgUptime: "Avg Uptime",
    activeAlerts: "Active Alerts",
    statsRefreshError: "Some dashboard stats could not be refreshed. Retry to load the latest values.",
    quickScanTitle: "Quick Scan",
    quickScanDescription: "Launch a full scan from the dashboard.",
    quickScanUrlAria: "Quick scan URL",
    quickScanInvalidUrl: "Please enter a valid URL",
    quickScanFailed: "Failed to start scan",
    scanning: "Scanning...",
    scan: "Scan",
    recentScans: "Recent Scans",
    noScansYet: "No scans yet.",
    failedToLoadScans: "Failed to load scans",
    securityScoreAria: (label) => `Security score ${label}`,
    modulesCount: (completed, total) => `${completed}/${total} modules`,
    durationUnavailable: "Duration unavailable",
    monitorHealth: "Monitor Health",
    failedToLoadMonitors: "Failed to load monitors",
    noMonitorsConfigured: "No monitors configured.",
    addMonitor: "Add Monitor",
    viewAllMonitors: (count) => `View all ${count} monitors ->`,
    neverChecked: "Never checked",
    uptimeValue: (value) => `${value}% uptime`,
    uptimeUnavailable: "Uptime unavailable",
    latencyUnavailable: "No latency yet",
    sslWatchlist: "SSL Expiry Watchlist",
    failedToLoadSslWatchlist: "Failed to load SSL watchlist",
    viewAllMonitorsShort: "View all monitors ->",
    expiryUnavailable: "Expiry unavailable",
    expiredAgo: (days) => `Expired ${days}d ago`,
    expiresIn: (days) => `Expires in ${days}d`,
    sslUnknown: "Unknown",
    sslExpired: "Expired",
    sslCritical: "Critical",
    sslWarning: "Warning",
    sslOk: "OK",
    statusCompleted: "Completed",
    statusRunning: "Running",
    statusFailed: "Failed",
  },
  scan: {
    title: "Scan",
    subtitle: "Launch a new target scan and review external security posture signals.",
    stopped: "Scan stopped. It stays in your history with partial results.",
    stopFailed: (message) => `Could not stop scan: ${message}`,
    startFailed: (url, message) => `Failed to start scan for ${url}: ${message}`,
    startFailedGeneric: "Failed to start scan",
    scanStarted: "Scan started",
    scansStarted: (count) => `${count} scans started`,
    listTitle: "Scan List",
    resultsSummary: (total, refreshing) => `${total} results ${refreshing ? "(refreshing...)" : ""}`,
    refreshing: "(refreshing...)",
    deleteAll: "Delete All",
    deleteConfirm: "Delete this scan? This cannot be undone.",
    deleteAllConfirm: "Delete all scans in current filter results?",
    deleteFailed: (message) => `Delete failed: ${message}`,
    noScansMatchedDelete: "No scans matched current filters to delete.",
    deleteAllFailed: (message) => `Delete all failed: ${message}`,
    rescanFailed: (message) => `Rescan failed: ${message}`,
    searchAria: "Search scans",
    searchPlaceholder: "Search URL or domain",
    sortAria: "Sort scans",
    statusFilterAria: "Category filter",
    sortNewest: "Newest first",
    sortOldest: "Oldest first",
    sortScoreHigh: "Security score: high to low",
    sortScoreLow: "Security score: low to high",
    sortDomainAsc: "Domain: A to Z",
    sortDomainDesc: "Domain: Z to A",
    sortProgressHigh: "Progress: high to low",
    categoryAll: "Category: All",
    categoryActive: "Category: Active",
    categoryCompleted: "Category: Completed",
    categoryFailed: "Category: Failed",
    categoryCancelled: "Category: Cancelled",
    noScansFound: "No scans found for current filters.",
    securityLabel: "Security",
    rescan: "Rescan",
    rescanning: "Rescanning...",
    pageSummary: (page, totalPages, total) => `Page ${page} of ${totalPages} · ${total} total scans`,
    rowsPerPage: "Rows per page",
    rowsPerPageAria: "Scan rows per page",
    loadingScans: "Loading scans...",
    statusCompleted: "Completed",
    statusRunning: "Running",
    statusCancelled: "Cancelled",
    statusFailed: "Failed",
    inputPlaceholder: "Enter URLs to scan (one per line or comma-separated)\nhttps://example.com\nhttps://example.org",
    urlsDetected: (count) => `${count} URL${count > 1 ? "s" : ""} detected`,
    urlRequired: "Please enter at least one valid URL",
    moduleRequired: "Please select at least one module to scan",
    authorizationRequired: "Please confirm that you are authorized to scan this target",
    portScanning: "Port Scanning",
    authorizationBadge: "Authorization required",
    portDescription: "Scan for open ports on the target host. This performs active TCP connections to common ports.",
    permissionNotice: "Only scan hosts you own or have permission to test.",
    scanDepth: "Scan Depth",
    portScanDepthAria: "Port scan depth",
    authorizationConfirm: "I confirm that I own this host or have explicit authorization to run active port scans against it.",
    startingScan: "Starting scan...",
    startScan: "Start Scan",
    scanUrls: (count) => `Scan ${count} URLs`,
  },
  monitor: {
    title: "Website Monitors",
    subtitle: "Track uptime, detect changes, and monitor SSL certificates.",
    addMonitor: "Add Monitor",
    loadingMonitors: "Loading monitors...",
    searchPlaceholder: "Search by name or URL...",
    statusFilterAria: "Status filter",
    sortAria: "Sort monitors",
    allStatuses: "All statuses",
    statusUp: "Up",
    statusDown: "Down",
    statusDegraded: "Degraded",
    statusPaused: "Paused",
    statusPending: "Pending",
    sortDefault: "Sort: default (newest)",
    sortLabels: {
      createdAt: "Created",
      updatedAt: "Updated",
      displayName: "Name",
      lastCheckAt: "Last check",
      lastResponseTimeMs: "Latency",
      uptimePercentage: "Uptime",
    },
    advancedFilters: "Advanced filters",
    active: "active",
    tags: "Tags",
    tagPlaceholder: "Type tag, press Enter...",
    removeTagAria: (tag) => `Remove tag ${tag}`,
    matchAny: "Match any",
    matchAll: "Match all",
    maxLatency: "Max latency (ms)",
    noLimit: "No limit",
    minUptime: "Min uptime (%)",
    noFloor: "No floor",
    loadFailed: "Failed to load monitors",
    emptyPageRedirect: "This monitor page is empty. Redirecting to the last available page...",
    noFilterMatches: "No monitors match your filters.",
    pageSummary: (page, totalPages, total) => `Page ${page} of ${totalPages} · ${total} total monitors`,
    rowsPerPage: "Rows per page",
    rowsPerPageAria: "Monitor rows per page",
    selectAllAria: "Select all monitors",
    deselectAllAria: "Deselect all monitors",
    selectMonitorAria: (name) => `Select ${name}`,
    tableName: "Name",
    tableUrl: "URL",
    tableCapabilities: "Capabilities",
    tableStatus: "Status",
    tableLastCheck: "Last check",
    tableUptime: "Uptime",
    tableLatency: "Latency",
    tableActions: "Actions",
    never: "Never",
  },
  reports: {
    title: "Reports",
    subtitle: "Generate server-side security assessment reports from completed scans.",
    createSchedule: "Create Schedule",
    generateReport: "Generate Report",
    reportsTab: "Reports",
    schedulesTab: "Schedules",
    loadingReports: "Loading reports...",
    loadingSchedules: "Loading schedules...",
    noReportsTitle: "No reports yet",
    noReportsDescription: "Create your first report from a completed scan to get a downloadable PDF, HTML, or Markdown summary.",
    noSchedulesTitle: "No schedules yet",
    noSchedulesDescription: "Create a weekly or monthly schedule to generate reports automatically.",
    tableTitle: "Title",
    tableDomain: "Domain",
    tableFormat: "Format",
    tableStatus: "Status",
    tableSize: "Size",
    tableCreated: "Created",
    tableActions: "Actions",
    statusCompleted: "completed",
    statusFailed: "failed",
    statusGenerating: "generating",
    statusDelivering: "delivering",
    statusPending: "pending",
    reportDeletedTitle: "Report deleted",
    reportDeletedDescription: (title) => `"${title}" was removed.`,
    deleteFailedTitle: "Delete failed",
    deleteReportFallback: "Could not delete the report.",
    downloadFailedTitle: "Download failed",
    downloadFailedFallback: "Download failed.",
    compare: "Compare",
    compareAvailableTitle: "Compare against another scan of the same domain",
    compareUnavailableTitle: "Original scan deleted; compare unavailable",
    deleteReportTitle: "Delete Report",
    deleteReportDescription: (title) => `Are you sure you want to delete "${title}"?`,
    thisReport: "this report",
    cancel: "Cancel",
    pleaseWait: "Please wait...",
    generateDialogTitle: "Generate Report",
    generateDialogDescription: "Create a server-side security assessment report from a completed scan and optional monitor data.",
    scanLabel: "Scan",
    selectCompletedScan: "Select a completed scan",
    includeMonitorSummary: "Include monitor summary",
    monitorLabel: "Monitor",
    selectMonitor: "Select a monitor",
    periodLabel: "Period",
    formatLabel: "Format",
    titleLabel: "Title",
    defaultReportTitle: (target, date) => `Security Report - ${target} - ${date}`,
    scanRequiredTitle: "Scan required",
    scanRequiredDescription: "Please select a completed scan first.",
    reportQueuedTitle: "Report queued",
    reportQueuedDescription: (title) => `"${title}" is being generated.`,
    generationFailedTitle: "Generation failed",
    queueReportFallback: "Failed to queue report.",
    generating: "Generating...",
    scheduleDialogCreateTitle: "Create Schedule",
    scheduleDialogEditTitle: "Edit Schedule",
    scheduleDialogDescription: "Generate recurring weekly or monthly reports and deliver them by email or Slack.",
    nameLabel: "Name",
    timezoneLabel: "Timezone",
    cadenceLabel: "Cadence",
    weekly: "Weekly",
    monthly: "Monthly",
    weekdayLabel: "Weekday",
    dayLabel: "Day",
    hourLabel: "Hour",
    minuteLabel: "Minute",
    deliveryLabel: "Delivery",
    slackConfiguredChannel: "Slack using the configured notification channel",
    noDeliveryWarning: "No delivery channel selected. Reports will still be generated and stored.",
    enabledLabel: "Enabled",
    saving: "Saving...",
    saveSchedule: "Save Schedule",
    scheduleCreatedTitle: "Schedule created",
    scheduleUpdatedTitle: "Schedule updated",
    scheduleReadyDescription: (name) => `"${name}" is ready.`,
    scheduleFormFallback: "Please check the schedule form.",
    scheduleSaveFallback: "Failed to save report schedule.",
    scheduleNotSavedTitle: "Schedule not saved",
    scheduleTableName: "Name",
    scheduleTableCadence: "Cadence",
    scheduleTableFormat: "Format",
    scheduleTableDelivery: "Delivery",
    scheduleTableLastRun: "Last run",
    scheduleTableNextRun: "Next run",
    scheduleTableStatus: "Status",
    scheduleTableActions: "Actions",
    storeOnly: "Store only",
    scheduleEnabledStatus: "enabled",
    schedulePausedStatus: "paused",
    deliveryNeedsAttention: "Delivery needs attention",
    edit: "Edit",
    pause: "Pause",
    resume: "Resume",
    runNow: "Run now",
    schedulePausedTitle: "Schedule paused",
    scheduleResumedTitle: "Schedule resumed",
    scheduleUpdatedDescription: (name) => `"${name}" was updated.`,
    updateFailedTitle: "Update failed",
    updateScheduleFallback: "Could not update schedule.",
    runQueuedTitle: "Run queued",
    runQueuedDescription: (name) => `"${name}" is generating a report now.`,
    runFailedTitle: "Run failed",
    runScheduleFallback: "Could not run schedule.",
    scheduleDeletedTitle: "Schedule deleted",
    scheduleDeletedDescription: (name) => `"${name}" was removed.`,
    deleteScheduleFallback: "Could not delete schedule.",
    deleteScheduleTitle: "Delete Schedule",
    deleteScheduleDescription: (name) => `Delete "${name}" and its run history?`,
    thisSchedule: "this schedule",
    weekDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    dayOfMonth: (day) => `Day ${day}`,
  },
  settings: {
    title: "Settings",
    subtitle: "Manage your account and preferences.",
    navAppearance: "Appearance",
    navApiKeys: "API Keys",
    navProfile: "Profile",
    navScanDefaults: "Scan Defaults",
    navNotifications: "Notifications",
    navSecurity: "Security",
    navDataPrivacy: "Data & Privacy",
    themeTitle: "Theme",
    themeDescription: "Select your preferred color scheme.",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    fontSizeTitle: "Font Size",
    fontSizeDescription: "Adjust the base font size across the interface.",
    fontSmall: "Small",
    fontDefault: "Default",
    fontLarge: "Large",
    fontPreview: "The quick brown fox jumps.",
    languageTitle: "Language",
    languageDescription: "Choose your preferred display language.",
    apiKeysTitle: "API Keys",
    apiKeysDescription: "Configure API keys for AI-powered analysis. Keys are stored locally in your browser.",
    save: "Save",
    edit: "Edit",
    test: "Test",
    testing: "Testing...",
    connectionSuccessful: "Connection successful",
    comingSoon: "Coming Soon",
    profileTitle: "Profile",
    profileDescription: "Manage your display name, email, and avatar.",
    scanDefaultsTitle: "Scan Defaults",
    scanDefaultsDescription: "Configure default timeout, concurrency, and enabled modules for new scans.",
    securityTitle: "Security",
    securityDescription: "Manage your password, two-factor authentication, and active sessions.",
    dataPrivacyTitle: "Data & Privacy",
    dataPrivacyDescription: "Control data retention, export your data, or delete your account.",
  },
};

const zh: DashboardMessages = {
  common: {
    retry: "重試",
    loading: "載入中...",
    viewAll: "查看全部",
    previous: "上一頁",
    next: "下一頁",
    reset: "重設",
    search: "搜尋",
    delete: "刪除",
    deleting: "刪除中...",
  },
  overview: {
    title: "儀表板",
    subtitle: "總覽目前的安全狀態。",
    totalScans: "掃描總數",
    activeMonitors: "啟用監控",
    avgUptime: "平均可用率",
    activeAlerts: "待處理告警",
    statsRefreshError: "部分儀表板統計無法更新。請重試以載入最新數值。",
    quickScanTitle: "快速掃描",
    quickScanDescription: "直接從儀表板啟動完整掃描。",
    quickScanUrlAria: "快速掃描 URL",
    quickScanInvalidUrl: "請輸入有效 URL",
    quickScanFailed: "無法啟動掃描",
    scanning: "掃描中...",
    scan: "掃描",
    recentScans: "近期掃描",
    noScansYet: "尚無掃描。",
    failedToLoadScans: "無法載入掃描",
    securityScoreAria: (label) => `安全分數 ${label}`,
    modulesCount: (completed, total) => `${completed}/${total} 個模組`,
    durationUnavailable: "無法取得耗時",
    monitorHealth: "監控健康狀態",
    failedToLoadMonitors: "無法載入監控",
    noMonitorsConfigured: "尚未設定監控。",
    addMonitor: "新增監控",
    viewAllMonitors: (count) => `查看全部 ${count} 個監控 ->`,
    neverChecked: "尚未檢查",
    uptimeValue: (value) => `${value}% 可用率`,
    uptimeUnavailable: "無法取得可用率",
    latencyUnavailable: "尚無延遲資料",
    sslWatchlist: "SSL 到期觀察清單",
    failedToLoadSslWatchlist: "無法載入 SSL 觀察清單",
    viewAllMonitorsShort: "查看全部監控 ->",
    expiryUnavailable: "無法取得到期資訊",
    expiredAgo: (days) => `已過期 ${days} 天`,
    expiresIn: (days) => `${days} 天後到期`,
    sslUnknown: "未知",
    sslExpired: "已過期",
    sslCritical: "嚴重",
    sslWarning: "警告",
    sslOk: "正常",
    statusCompleted: "已完成",
    statusRunning: "執行中",
    statusFailed: "失敗",
  },
  scan: {
    title: "掃描",
    subtitle: "啟動新的目標掃描，並檢視外部安全狀態訊號。",
    stopped: "掃描已停止，部分結果仍會保留在歷史紀錄中。",
    stopFailed: (message) => `無法停止掃描：${message}`,
    startFailed: (url, message) => `無法為 ${url} 啟動掃描：${message}`,
    startFailedGeneric: "無法啟動掃描",
    scanStarted: "掃描已啟動",
    scansStarted: (count) => `已啟動 ${count} 個掃描`,
    listTitle: "掃描清單",
    resultsSummary: (total, refreshing) => `${total} 筆結果 ${refreshing ? "（更新中...）" : ""}`,
    refreshing: "（更新中...）",
    deleteAll: "全部刪除",
    deleteConfirm: "要刪除此掃描嗎？此操作無法復原。",
    deleteAllConfirm: "要刪除目前篩選結果中的所有掃描嗎？",
    deleteFailed: (message) => `刪除失敗：${message}`,
    noScansMatchedDelete: "目前篩選條件沒有可刪除的掃描。",
    deleteAllFailed: (message) => `全部刪除失敗：${message}`,
    rescanFailed: (message) => `重新掃描失敗：${message}`,
    searchAria: "搜尋掃描",
    searchPlaceholder: "搜尋 URL 或網域",
    sortAria: "排序掃描",
    statusFilterAria: "分類篩選",
    sortNewest: "最新優先",
    sortOldest: "最舊優先",
    sortScoreHigh: "安全分數：高到低",
    sortScoreLow: "安全分數：低到高",
    sortDomainAsc: "網域：A 到 Z",
    sortDomainDesc: "網域：Z 到 A",
    sortProgressHigh: "進度：高到低",
    categoryAll: "分類：全部",
    categoryActive: "分類：進行中",
    categoryCompleted: "分類：已完成",
    categoryFailed: "分類：失敗",
    categoryCancelled: "分類：已取消",
    noScansFound: "目前篩選條件沒有掃描。",
    securityLabel: "安全分數",
    rescan: "重新掃描",
    rescanning: "重新掃描中...",
    pageSummary: (page, totalPages, total) => `第 ${page} / ${totalPages} 頁 · 共 ${total} 筆掃描`,
    rowsPerPage: "每頁筆數",
    rowsPerPageAria: "掃描每頁筆數",
    loadingScans: "正在載入掃描...",
    statusCompleted: "已完成",
    statusRunning: "執行中",
    statusCancelled: "已取消",
    statusFailed: "失敗",
    inputPlaceholder: "輸入要掃描的 URL（每行一個或以逗號分隔）\nhttps://example.com\nhttps://example.org",
    urlsDetected: (count) => `偵測到 ${count} 個 URL`,
    urlRequired: "請至少輸入一個有效 URL",
    moduleRequired: "請至少選擇一個掃描模組",
    authorizationRequired: "請確認您有權限掃描此目標",
    portScanning: "連接埠掃描",
    authorizationBadge: "需要授權",
    portDescription: "掃描目標主機的開放連接埠，會對常見連接埠建立主動 TCP 連線。",
    permissionNotice: "僅掃描您擁有或已取得測試授權的主機。",
    scanDepth: "掃描深度",
    portScanDepthAria: "連接埠掃描深度",
    authorizationConfirm: "我確認自己擁有此主機，或已取得明確授權可對其執行主動連接埠掃描。",
    startingScan: "正在啟動掃描...",
    startScan: "開始掃描",
    scanUrls: (count) => `掃描 ${count} 個 URL`,
  },
  monitor: {
    title: "網站監控",
    subtitle: "追蹤可用性、偵測變更，並監控 SSL 憑證。",
    addMonitor: "新增監控",
    loadingMonitors: "正在載入監控...",
    searchPlaceholder: "依名稱或 URL 搜尋...",
    statusFilterAria: "狀態篩選",
    sortAria: "排序監控",
    allStatuses: "所有狀態",
    statusUp: "正常",
    statusDown: "中斷",
    statusDegraded: "降級",
    statusPaused: "已暫停",
    statusPending: "等待中",
    sortDefault: "排序：預設（最新）",
    sortLabels: {
      createdAt: "建立時間",
      updatedAt: "更新時間",
      displayName: "名稱",
      lastCheckAt: "上次檢查",
      lastResponseTimeMs: "延遲",
      uptimePercentage: "可用率",
    },
    advancedFilters: "進階篩選",
    active: "已啟用",
    tags: "標籤",
    tagPlaceholder: "輸入標籤後按 Enter...",
    removeTagAria: (tag) => `移除標籤 ${tag}`,
    matchAny: "符合任一",
    matchAll: "符合全部",
    maxLatency: "最大延遲（ms）",
    noLimit: "不限",
    minUptime: "最低可用率（%）",
    noFloor: "無下限",
    loadFailed: "無法載入監控",
    emptyPageRedirect: "此監控分頁是空的，正在導向最後一個可用分頁...",
    noFilterMatches: "沒有符合篩選條件的監控。",
    pageSummary: (page, totalPages, total) => `第 ${page} / ${totalPages} 頁 · 共 ${total} 個監控`,
    rowsPerPage: "每頁筆數",
    rowsPerPageAria: "監控每頁筆數",
    selectAllAria: "選取全部監控",
    deselectAllAria: "取消選取全部監控",
    selectMonitorAria: (name) => `選取 ${name}`,
    tableName: "名稱",
    tableUrl: "URL",
    tableCapabilities: "能力",
    tableStatus: "狀態",
    tableLastCheck: "上次檢查",
    tableUptime: "可用率",
    tableLatency: "延遲",
    tableActions: "操作",
    never: "從未",
  },
  reports: {
    title: "報告",
    subtitle: "從已完成掃描產生伺服器端安全評估報告。",
    createSchedule: "建立排程",
    generateReport: "產生報告",
    reportsTab: "報告",
    schedulesTab: "排程",
    loadingReports: "正在載入報告...",
    loadingSchedules: "正在載入排程...",
    noReportsTitle: "尚無報告",
    noReportsDescription: "從已完成掃描建立第一份報告，即可下載 PDF、HTML 或 Markdown 摘要。",
    noSchedulesTitle: "尚無排程",
    noSchedulesDescription: "建立每週或每月排程，自動產生報告。",
    tableTitle: "標題",
    tableDomain: "網域",
    tableFormat: "格式",
    tableStatus: "狀態",
    tableSize: "大小",
    tableCreated: "建立時間",
    tableActions: "操作",
    statusCompleted: "已完成",
    statusFailed: "失敗",
    statusGenerating: "產生中",
    statusDelivering: "派送中",
    statusPending: "等待中",
    reportDeletedTitle: "報告已刪除",
    reportDeletedDescription: (title) => `「${title}」已移除。`,
    deleteFailedTitle: "刪除失敗",
    deleteReportFallback: "無法刪除此報告。",
    downloadFailedTitle: "下載失敗",
    downloadFailedFallback: "下載失敗。",
    compare: "比較",
    compareAvailableTitle: "與同一網域的另一個掃描比較",
    compareUnavailableTitle: "原始掃描已刪除，無法比較",
    deleteReportTitle: "刪除報告",
    deleteReportDescription: (title) => `確定要刪除「${title}」嗎？`,
    thisReport: "此報告",
    cancel: "取消",
    pleaseWait: "請稍候...",
    generateDialogTitle: "產生報告",
    generateDialogDescription: "從已完成掃描與選填的監控資料建立伺服器端安全評估報告。",
    scanLabel: "掃描",
    selectCompletedScan: "選擇已完成掃描",
    includeMonitorSummary: "包含監控摘要",
    monitorLabel: "監控",
    selectMonitor: "選擇監控",
    periodLabel: "期間",
    formatLabel: "格式",
    titleLabel: "標題",
    defaultReportTitle: (target, date) => `安全報告 - ${target} - ${date}`,
    scanRequiredTitle: "需要選擇掃描",
    scanRequiredDescription: "請先選擇一個已完成掃描。",
    reportQueuedTitle: "報告已排入佇列",
    reportQueuedDescription: (title) => `「${title}」正在產生。`,
    generationFailedTitle: "產生失敗",
    queueReportFallback: "無法將報告排入佇列。",
    generating: "產生中...",
    scheduleDialogCreateTitle: "建立排程",
    scheduleDialogEditTitle: "編輯排程",
    scheduleDialogDescription: "建立每週或每月週期性報告，並透過 email 或 Slack 派送。",
    nameLabel: "名稱",
    timezoneLabel: "時區",
    cadenceLabel: "週期",
    weekly: "每週",
    monthly: "每月",
    weekdayLabel: "星期",
    dayLabel: "日期",
    hourLabel: "小時",
    minuteLabel: "分鐘",
    deliveryLabel: "派送",
    slackConfiguredChannel: "使用已設定通知渠道的 Slack",
    noDeliveryWarning: "尚未選擇派送渠道。報告仍會產生並儲存。",
    enabledLabel: "啟用",
    saving: "儲存中...",
    saveSchedule: "儲存排程",
    scheduleCreatedTitle: "排程已建立",
    scheduleUpdatedTitle: "排程已更新",
    scheduleReadyDescription: (name) => `「${name}」已就緒。`,
    scheduleFormFallback: "請檢查排程表單。",
    scheduleSaveFallback: "無法儲存報告排程。",
    scheduleNotSavedTitle: "排程未儲存",
    scheduleTableName: "名稱",
    scheduleTableCadence: "週期",
    scheduleTableFormat: "格式",
    scheduleTableDelivery: "派送",
    scheduleTableLastRun: "上次執行",
    scheduleTableNextRun: "下次執行",
    scheduleTableStatus: "狀態",
    scheduleTableActions: "操作",
    storeOnly: "僅儲存",
    scheduleEnabledStatus: "已啟用",
    schedulePausedStatus: "已暫停",
    deliveryNeedsAttention: "派送需要處理",
    edit: "編輯",
    pause: "暫停",
    resume: "恢復",
    runNow: "立即執行",
    schedulePausedTitle: "排程已暫停",
    scheduleResumedTitle: "排程已恢復",
    scheduleUpdatedDescription: (name) => `「${name}」已更新。`,
    updateFailedTitle: "更新失敗",
    updateScheduleFallback: "無法更新排程。",
    runQueuedTitle: "執行已排入佇列",
    runQueuedDescription: (name) => `「${name}」正在產生報告。`,
    runFailedTitle: "執行失敗",
    runScheduleFallback: "無法執行排程。",
    scheduleDeletedTitle: "排程已刪除",
    scheduleDeletedDescription: (name) => `「${name}」已移除。`,
    deleteScheduleFallback: "無法刪除排程。",
    deleteScheduleTitle: "刪除排程",
    deleteScheduleDescription: (name) => `刪除「${name}」及其執行歷史嗎？`,
    thisSchedule: "此排程",
    weekDays: ["週一", "週二", "週三", "週四", "週五", "週六", "週日"],
    dayOfMonth: (day) => `${day} 日`,
  },
  settings: {
    title: "設定",
    subtitle: "管理帳戶與偏好設定。",
    navAppearance: "外觀",
    navApiKeys: "API 金鑰",
    navProfile: "個人資料",
    navScanDefaults: "掃描預設值",
    navNotifications: "通知",
    navSecurity: "安全性",
    navDataPrivacy: "資料與隱私",
    themeTitle: "主題",
    themeDescription: "選擇偏好的配色方案。",
    themeLight: "淺色",
    themeDark: "深色",
    themeSystem: "跟隨系統",
    fontSizeTitle: "字體大小",
    fontSizeDescription: "調整整個介面的基礎字體大小。",
    fontSmall: "小",
    fontDefault: "預設",
    fontLarge: "大",
    fontPreview: "快速的棕色狐狸跳躍。",
    languageTitle: "語言",
    languageDescription: "選擇偏好的顯示語言。",
    apiKeysTitle: "API 金鑰",
    apiKeysDescription: "設定 AI 分析使用的 API 金鑰。金鑰只會儲存在您的瀏覽器本機。",
    save: "儲存",
    edit: "編輯",
    test: "測試",
    testing: "測試中...",
    connectionSuccessful: "連線成功",
    comingSoon: "即將推出",
    profileTitle: "個人資料",
    profileDescription: "管理顯示名稱、電子郵件與頭像。",
    scanDefaultsTitle: "掃描預設值",
    scanDefaultsDescription: "設定新掃描的預設逾時、併發數與啟用模組。",
    securityTitle: "安全性",
    securityDescription: "管理密碼、雙因素驗證與目前登入工作階段。",
    dataPrivacyTitle: "資料與隱私",
    dataPrivacyDescription: "控制資料保留、匯出資料或刪除帳戶。",
  },
};

export function getDashboardMessages(lang: AppearanceLanguage): DashboardMessages {
  return lang === "zh" ? zh : en;
}
