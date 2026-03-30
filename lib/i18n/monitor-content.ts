import type { AppearanceLanguage } from "@/lib/hooks/use-appearance-language";

export type MonitorContentMessages = {
  /** Monitor settings: content_change thresholds (shared with settings form) */
  settingsAlertOnHashChange: string;
  settingsMinChangeBytesLabel: string;
  settingsMinChangeBytesPlaceholder: string;
  settingsMinChangeBytesHint: string;
  settingsMinTotalDiffLinesLabel: string;
  settingsMinTotalDiffLinesHint: string;
  settingsDedupWindowLabel: string;
  settingsDedupWindowHint: string;
  settingsNormalizationRulesHint: string;
  settingsIntervalProductNote: string;
  settingsNormalizeVolatileLabel: string;
  settingsSuppressDegradedLabel: string;
  /** Pass to `Date#toLocaleString` for timestamps on this page */
  dateLocale: string;
  pageTitle: string;
  baselineTitle: string;
  baselineEmpty: string;
  baselineDescription: string;
  baselineSnapshotTime: string;
  baselineSha256: string;
  filterLabel: string;
  filterAll: string;
  filterSmall: string;
  filterMedium: string;
  filterLarge: string;
  /** Short labels for changeCategory badge */
  categorySmall: string;
  categoryMedium: string;
  categoryLarge: string;
  jumpToLarge: string;
  /** Explains alignment between client size filter and backend changeCategory / API */
  categoryFilterHint: string;
  diffSnippetTitle: string;
  diffSnippetPreview: string;
  export: string;
  exportJson: string;
  exportCsv: string;
  exportPdf: string;
  exportPdfUnavailable: string;
  exportPdfFailed: string;
  settingsAlertMediumLargeOnlyLabel: string;
  settingsAlertMediumLargeOnlyHint: string;
  settingsRepeatAlertMaxLabel: string;
  settingsRepeatAlertMaxHint: string;
  settingsRepeatAlertWindowLabel: string;
  settingsRepeatAlertWindowHint: string;
  settingsSelectorAdvancedTitle: string;
  settingsSelectorAdvancedHint: string;
  settingsSelectorListLabel: string;
  settingsSelectorListPlaceholder: string;
  loadingChanges: string;
  noChangesYet: string;
  deepLinkNoChanges: string;
  filterBanner: string;
  showAll: string;
  clearSelection: string;
  pagingBannerHasMore: (pageSize: number) => string;
  /** Auto-loading older pages for ?change= deep link */
  deepLinkLoadingPages: string;
  pagingBannerExhausted: string;
  /** Consecutive identical diffFingerprint rows */
  fingerprintGroupSummary: (count: number) => string;
  loadedSummary: (loaded: number, total: number) => string;
  noRowsMatchFilter: string;
  viewDiff: string;
  /** Linked visual capture from same check or time window */
  linkedScreenshot: string;
  openLinkedScreenshot: string;
  linkedCorrelationCheckId: string;
  linkedCorrelationTimeWindow: string;
  loadMore: string;
  loading: string;
  diffTitle: string;
  diffRegionAria: string;
  closeDiffAria: string;
  dismiss: string;
  diffNoHtml: string;
  errForbidden: string;
  errPurged: string;
  errTimeout: string;
  errMissingChange: string;
  errGeneric: string;
  changeNotFoundToast: string;
};

const en: MonitorContentMessages = {
  settingsAlertOnHashChange: "Alert on content hash change",
  settingsMinChangeBytesLabel: "Min change size (bytes)",
  settingsMinChangeBytesPlaceholder: "Empty = any size",
  settingsMinChangeBytesHint:
    "0 or empty records any change that passes fingerprint comparison (not every raw byte flip when normalization treats bodies as equal). Higher values ignore smaller edits.",
  settingsMinTotalDiffLinesLabel: "Minimum diff lines (added + removed)",
  settingsMinTotalDiffLinesHint:
    "Optional. When set (e.g. 20), tiny diffs below this line count are not stored unless the byte threshold or server line-override rules apply. Example: min bytes 5000 with only 2 diff lines can still record if the byte rule passes.",
  settingsDedupWindowLabel: "Dedup window (seconds)",
  settingsDedupWindowHint:
    "Optional. Suppress **notifications** (SSE) when the same unified-diff fingerprint reappears within this many seconds after the previous occurrence of that fingerprint. MonitorChange rows are always stored. 0 = disable this time-based rule. Empty = server default.",
  settingsNormalizationRulesHint:
    "Keep “Normalize volatile tokens” on. Add normalizationRules as { pattern, replacement } regex pairs to strip known volatile fragments (e.g. a session query param). Over-broad patterns can hide real edits—test on a copy first.",
  settingsIntervalProductNote:
    "Longer check intervals reduce churn on dynamic pages but increase detection latency versus your SLA targets.",
  pagingBannerHasMore: (pageSize: number) =>
    `This change is not in the loaded list yet (${pageSize} per page, newest first). Use “Load more changes” below to load older records.`,
  deepLinkLoadingPages: "Loading older pages to resolve the linked change…",
  fingerprintGroupSummary: (count: number) =>
    `${count} consecutive changes with the same diff fingerprint (expand for individual links)`,
  settingsNormalizeVolatileLabel:
    "Normalize UUIDs / long hex tokens before hashing (reduces noise; disable for legacy raw-byte comparison)",
  settingsSuppressDegradedLabel:
    "Do not record content changes for captcha / bot-check style pages (heuristic)",
  dateLocale: "en-US",
  pageTitle: "Content changes",
  baselineTitle: "Current baseline",
  baselineEmpty: "No content snapshot recorded yet. The next successful check will establish a baseline.",
  baselineDescription:
    "Baseline snapshot used for content comparison (server uses the snapshot marked as baseline, otherwise the earliest snapshot).",
  baselineSnapshotTime: "Snapshot time",
  baselineSha256: "SHA-256",
  filterLabel: "Size filter",
  filterAll: "All changes",
  filterSmall: "Small (≤10 lines)",
  filterMedium: "Medium (11–50 lines)",
  filterLarge: "Large (>50 lines)",
  categorySmall: "Small",
  categoryMedium: "Medium",
  categoryLarge: "Large",
  jumpToLarge: "Jump to large",
  categoryFilterHint:
    "Size filter uses each row’s category (or line counts): small ≤10 diff lines, medium 11–50, large >50 — same rules as GET /changes?category= and stored changeCategory.",
  diffSnippetTitle: "Page title",
  diffSnippetPreview: "Text preview",
  export: "Export",
  exportJson: "JSON",
  exportCsv: "CSV",
  exportPdf: "PDF",
  exportPdfUnavailable: "PDF export is not enabled on the server.",
  exportPdfFailed: "PDF export failed.",
  settingsAlertMediumLargeOnlyLabel: "Notify only for medium or large changes (skip small)",
  settingsAlertMediumLargeOnlyHint:
    "Small changes are still recorded in the timeline; only the real-time notification is skipped.",
  settingsRepeatAlertMaxLabel: "Max notifications per diff fingerprint (optional)",
  settingsRepeatAlertMaxHint:
    "Use with the window below. When the count of notified changes with the same fingerprint in the window reaches this value, further notifications are suppressed (rows still stored). Leave empty to disable.",
  settingsRepeatAlertWindowLabel: "Sliding window for fingerprint cap (minutes)",
  settingsRepeatAlertWindowHint: "Required together with max notifications above.",
  settingsSelectorAdvancedTitle: "Advanced: CSS selector scope",
  settingsSelectorAdvancedHint:
    "Requires server CONTENT_SELECTOR_EXTRACTION_ENABLED. Inner text from matched nodes is concatenated in selector order (mergeStrategy concat_ordered). Client-rendered SPAs may not contain target markup server-side.",
  settingsSelectorListLabel: "Selectors (one per line)",
  settingsSelectorListPlaceholder: "main article\n#content",
  loadingChanges: "Loading changes…",
  noChangesYet: "No content changes detected yet.",
  deepLinkNoChanges:
    "The URL references a change, but there are no change records yet; the link may be invalid.",
  filterBanner:
    "A change is selected from the URL but hidden by the current size filter; the diff panel may still show content.",
  showAll: "Show all",
  clearSelection: "Clear selection",
  pagingBannerExhausted:
    "All change records are loaded and this change is still not in the list; the link may be invalid or data was removed.",
  loadedSummary: (loaded: number, total: number) =>
    `Loaded ${loaded} of ${total} changes (newest first).`,
  noRowsMatchFilter: "No changes match this filter.",
  viewDiff: "View diff",
  linkedScreenshot: "Screenshot",
  openLinkedScreenshot: "Open linked screenshot",
  linkedCorrelationCheckId: "Linked by same check run",
  linkedCorrelationTimeWindow: "Linked by nearest capture in time window",
  loadMore: "Load more changes",
  loading: "Loading…",
  diffTitle: "Content diff",
  diffRegionAria: "Content diff",
  closeDiffAria: "Close diff",
  dismiss: "Dismiss",
  diffNoHtml: "No diff HTML to display.",
  errForbidden: "You do not have permission to view this diff.",
  errPurged:
    "Snapshot text for this change is no longer stored (retention). Metadata may still be listed above.",
  errTimeout: "The diff took too long to build (large page). Try again, or use export if available.",
  errMissingChange: "This change record was not found. It may have been cleaned up.",
  errGeneric: "Failed to load diff. Please try again.",
  changeNotFoundToast: "Change not found; link cleared.",
};

const zh: MonitorContentMessages = {
  settingsAlertOnHashChange: "內容雜湊變更時發出告警",
  settingsMinChangeBytesLabel: "最小變更大小（位元組）",
  settingsMinChangeBytesPlaceholder: "留空 = 任意大小",
  settingsMinChangeBytesHint:
    "設為 0 或留空時，只要通過指紋比對即會記錄變更（若正規化後內容相同則不會因每次 raw 位元組不同而記錄）。數值愈大愈容易忽略較小差異。",
  settingsMinTotalDiffLinesLabel: "最小差異行數（新增+刪除）",
  settingsMinTotalDiffLinesHint:
    "選填。設定後（例如 20），低於此行數的微小差異原則上不寫入，除非符合位元組門檻或伺服器行數覆寫規則。",
  settingsDedupWindowLabel: "去重時間窗（秒）",
  settingsDedupWindowHint:
    "選填。當同一 diff 指紋在間隔內再次出現時，**不發送通知**（SSE）；MonitorChange 仍會寫入。0 = 關閉此時間規則。留空則用伺服器預設。",
  settingsNormalizationRulesHint:
    "建議保持「正規化易變權杖」開啟。可在 normalizationRules 以 { pattern, replacement } 加入 regex，移除已知易變片段；規則過寬可能掩蓋真實變更，請先測試。",
  settingsIntervalProductNote:
    "拉長檢查間隔可降低動態頁面造成的時間軸跳動，但會提高偵測延遲，需與 SLA／延遲目標權衡。",
  settingsNormalizeVolatileLabel:
    "比對前先正規化 UUID／長十六進位字串（降低雜訊；關閉則與舊版 raw 位元組比對一致）",
  settingsSuppressDegradedLabel: "偵測為驗證碼／機器人檢查頁時不寫入內容變更紀錄（啟發式）",
  dateLocale: "zh-TW",
  pageTitle: "內容變更",
  baselineTitle: "目前基準（baseline）",
  baselineEmpty: "尚未記錄內容快照。下次成功檢查後會建立基準。",
  baselineDescription:
    "顯示目前用於內容比對的基準快照（後端以標記為基準之快照為準，否則取最早快照）。",
  baselineSnapshotTime: "快照時間",
  baselineSha256: "SHA-256",
  filterLabel: "尺寸篩選",
  filterAll: "全部變更",
  filterSmall: "小（≤10 行）",
  filterMedium: "中（11–50 行）",
  filterLarge: "大（超過 50 行）",
  categorySmall: "小",
  categoryMedium: "中",
  categoryLarge: "大",
  jumpToLarge: "跳到大型變更",
  categoryFilterHint:
    "尺寸篩選依每筆紀錄的分類（或行數推算）：小 ≤10 行差異、中 11–50、大於 50 為大；與 GET /changes?category= 及後端 changeCategory 一致。",
  diffSnippetTitle: "頁面標題",
  diffSnippetPreview: "文字預覽",
  export: "匯出",
  exportJson: "JSON",
  exportCsv: "CSV",
  exportPdf: "PDF",
  exportPdfUnavailable: "伺服器未啟用 PDF 匯出。",
  exportPdfFailed: "PDF 匯出失敗。",
  settingsAlertMediumLargeOnlyLabel: "僅對中／大型變更發通知（略過小型）",
  settingsAlertMediumLargeOnlyHint: "小型變更仍會寫入時間軸，僅即時通知略過。",
  settingsRepeatAlertMaxLabel: "同一 diff 指紋最多通知次數（選填）",
  settingsRepeatAlertMaxHint: "需與下方時間窗並用；達上限後抑制進一步通知（紀錄仍寫入）。留空表示不使用此規則。",
  settingsRepeatAlertWindowLabel: "指紋通知次數的滑動時間窗（分鐘）",
  settingsRepeatAlertWindowHint: "與上方次數上限併用。",
  settingsSelectorAdvancedTitle: "進階：CSS 選擇器範圍",
  settingsSelectorAdvancedHint:
    "需伺服器啟用 CONTENT_SELECTOR_EXTRACTION_ENABLED。依選擇器順序擷取節點內文並合併（concat_ordered）。僅伺服器端 HTML；CSR 頁面可能無法匹配。",
  settingsSelectorListLabel: "選擇器（每行一個）",
  settingsSelectorListPlaceholder: "main article\n#content",
  loadingChanges: "載入變更紀錄…",
  noChangesYet: "尚未偵測到內容變更。",
  deepLinkNoChanges: "連結中指定了變更 ID，但目前沒有任何變更紀錄；連結可能已失效。",
  filterBanner:
    "已從連結選取變更，但目前的尺寸篩選會隱藏該筆；差異面板仍可能顯示內容。",
  showAll: "顯示全部",
  clearSelection: "清除選取",
  pagingBannerHasMore: (pageSize: number) =>
    `此變更不在目前已載入的清單中（每次載入 ${pageSize} 筆，新到舊）。請使用下方「載入更多變更」載入較舊紀錄。`,
  deepLinkLoadingPages: "正在載入較舊分頁以解析連結中的變更…",
  fingerprintGroupSummary: (count: number) =>
    `${count} 筆連續變更具有相同 diff 指紋（展開可個別連結）`,
  pagingBannerExhausted:
    "已載入全部變更紀錄，清單中仍找不到此變更；連結可能已失效或資料已清理。",
  loadedSummary: (loaded: number, total: number) =>
    `已載入 ${loaded} / 共 ${total} 筆變更（依偵測時間新到舊）。`,
  noRowsMatchFilter: "沒有符合此篩選條件的變更。",
  viewDiff: "檢視差異",
  linkedScreenshot: "截圖",
  openLinkedScreenshot: "開啟關聯截圖",
  linkedCorrelationCheckId: "與此次檢查同一執行（check）",
  linkedCorrelationTimeWindow: "以時間窗內最接近的截圖關聯",
  loadMore: "載入更多變更",
  loading: "載入中…",
  diffTitle: "內容差異",
  diffRegionAria: "內容差異",
  closeDiffAria: "關閉差異",
  dismiss: "關閉",
  diffNoHtml: "無可顯示的差異 HTML。",
  errForbidden: "沒有權限檢視此差異。",
  errPurged: "此變更的快照內容已因保留策略移除；上方仍可能列出變更中繼資料。",
  errTimeout: "產生差異逾時（頁面過大）。請重試或使用匯出。",
  errMissingChange: "找不到此變更紀錄，或已清理。",
  errGeneric: "無法載入差異，請稍後再試。",
  changeNotFoundToast: "找不到此變更，已清除連結參數。",
};

export function getMonitorContentMessages(lang: AppearanceLanguage): MonitorContentMessages {
  return lang === "zh" ? zh : en;
}
