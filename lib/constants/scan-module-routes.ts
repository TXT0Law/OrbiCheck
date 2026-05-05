/**
 * Single source of truth: each SCAN_MODULES id → route, nav group, labels, merge semantics.
 * Aligns with backend MODULE_TO_FRONTEND_KEY (transformers.py) for merged fields.
 */

import { SCAN_MODULE_LABELS, type ScanModuleId } from "@/lib/constants/scan-modules";

export type ScanSubNavGroupId = "overview" | "security" | "network" | "content";

export interface ScanModuleRouteEntry {
  /** Path segment under /dashboard/scan/[scanId]/ — null when merged into another module's page */
  routeSegment: string | null;
  subNavGroup: ScanSubNavGroupId;
  /** Sidebar label */
  navLabel: string;
  /** Breadcrumb + page title when this module owns routeSegment */
  pageTitleLabel: string;
  /** Developer / tooltip: why this module shares a page */
  mergeNote: string;
  /** When routeSegment is null, parent module that owns the URL */
  mergedIntoModuleId?: ScanModuleId;
  /** Deep-link hash for merged modules (include leading #) */
  routeHash?: string;
}

export const SCAN_MODULE_ROUTE_MAP: Record<ScanModuleId, ScanModuleRouteEntry> = {
  status: {
    routeSegment: "status",
    subNavGroup: "network",
    navLabel: SCAN_MODULE_LABELS.status,
    pageTitleLabel: "HTTP Status",
    mergeNote: "Own route.",
  },
  "get-ip": {
    routeSegment: "ip",
    subNavGroup: "network",
    navLabel: SCAN_MODULE_LABELS["get-ip"],
    pageTitleLabel: "IP Info",
    mergeNote: "Route segment ip (module id get-ip).",
  },
  headers: {
    routeSegment: "headers",
    subNavGroup: "security",
    navLabel: SCAN_MODULE_LABELS.headers,
    pageTitleLabel: "Security Headers",
    mergeNote: "Own route; includes http-security module output.",
  },
  dns: {
    routeSegment: "dns",
    subNavGroup: "network",
    navLabel: SCAN_MODULE_LABELS.dns,
    pageTitleLabel: "DNS Records",
    mergeNote: "Own route; txt-records and dns-server merge into this detail.dns view.",
  },
  "txt-records": {
    routeSegment: null,
    subNavGroup: "network",
    navLabel: SCAN_MODULE_LABELS["txt-records"],
    pageTitleLabel: SCAN_MODULE_LABELS["txt-records"],
    mergeNote: "Backend maps to ScanDetail.dns; use DNS page TXT tab.",
    mergedIntoModuleId: "dns",
    routeHash: "#txt-records",
  },
  hsts: {
    routeSegment: "hsts",
    subNavGroup: "security",
    navLabel: SCAN_MODULE_LABELS.hsts,
    pageTitleLabel: "HSTS Check",
    mergeNote: "Own route.",
  },
  "robots-txt": {
    routeSegment: "robots-txt",
    subNavGroup: "content",
    navLabel: SCAN_MODULE_LABELS["robots-txt"],
    pageTitleLabel: "Crawl Rules",
    mergeNote: "Own route.",
  },
  "security-txt": {
    routeSegment: "security-txt",
    subNavGroup: "security",
    navLabel: SCAN_MODULE_LABELS["security-txt"],
    pageTitleLabel: "Security.txt",
    mergeNote: "Own route.",
  },
  sitemap: {
    routeSegment: "sitemap",
    subNavGroup: "content",
    navLabel: SCAN_MODULE_LABELS.sitemap,
    pageTitleLabel: "Listed Pages",
    mergeNote: "Own route.",
  },
  "social-tags": {
    routeSegment: "social-tags",
    subNavGroup: "content",
    navLabel: SCAN_MODULE_LABELS["social-tags"],
    pageTitleLabel: "Social Tags",
    mergeNote: "Own route.",
  },
  "page-source": {
    routeSegment: null,
    subNavGroup: "content",
    navLabel: SCAN_MODULE_LABELS["page-source"],
    pageTitleLabel: SCAN_MODULE_LABELS["page-source"],
    mergeNote: "Shown on Screenshot page; keep #page-source for scroll.",
    mergedIntoModuleId: "screenshot",
    routeHash: "#page-source",
  },
  ssl: {
    routeSegment: "ssl",
    subNavGroup: "security",
    navLabel: "SSL Certificate",
    pageTitleLabel: "SSL Certificate",
    mergeNote: "Own route.",
  },
  tls: {
    routeSegment: "tls",
    subNavGroup: "security",
    navLabel: SCAN_MODULE_LABELS.tls,
    pageTitleLabel: "TLS Configuration",
    mergeNote: "Own route.",
  },
  whois: {
    routeSegment: "whois",
    subNavGroup: "network",
    navLabel: SCAN_MODULE_LABELS.whois,
    pageTitleLabel: "Whois",
    mergeNote: "Own route.",
  },
  "associated-hosts": {
    routeSegment: "associated-hosts",
    subNavGroup: "network",
    navLabel: SCAN_MODULE_LABELS["associated-hosts"],
    pageTitleLabel: "Associated Hosts",
    mergeNote: "Own route.",
  },
  dnssec: {
    routeSegment: "dnssec",
    subNavGroup: "security",
    navLabel: SCAN_MODULE_LABELS.dnssec,
    pageTitleLabel: "DNSSEC",
    mergeNote: "Own route.",
  },
  firewall: {
    routeSegment: "firewall",
    subNavGroup: "security",
    navLabel: SCAN_MODULE_LABELS.firewall,
    pageTitleLabel: "Firewall Detection",
    mergeNote: "Own route.",
  },
  cookies: {
    routeSegment: "cookies",
    subNavGroup: "security",
    navLabel: SCAN_MODULE_LABELS.cookies,
    pageTitleLabel: "Cookie Analysis",
    mergeNote: "Own route.",
  },
  redirects: {
    routeSegment: "redirects",
    subNavGroup: "network",
    navLabel: SCAN_MODULE_LABELS.redirects,
    pageTitleLabel: "Redirect Chain",
    mergeNote: "Own route.",
  },
  "mail-config": {
    routeSegment: "email-config",
    subNavGroup: "network",
    navLabel: SCAN_MODULE_LABELS["mail-config"],
    pageTitleLabel: "Email Configuration",
    mergeNote: "Route segment email-config.",
  },
  "http-security": {
    routeSegment: null,
    subNavGroup: "security",
    navLabel: SCAN_MODULE_LABELS["http-security"],
    pageTitleLabel: SCAN_MODULE_LABELS["http-security"],
    mergeNote: "Backend maps to ScanDetail.headers securityChecks.",
    mergedIntoModuleId: "headers",
    routeHash: "#http-security",
  },
  rank: {
    routeSegment: "ranking",
    subNavGroup: "content",
    navLabel: "Global Ranking & Carbon",
    pageTitleLabel: "Global Ranking & Carbon",
    mergeNote: "Canonical owner of /ranking; carbon + legacy-rank merge here.",
  },
  carbon: {
    routeSegment: null,
    subNavGroup: "content",
    navLabel: SCAN_MODULE_LABELS.carbon,
    pageTitleLabel: SCAN_MODULE_LABELS.carbon,
    mergeNote: "Merged into rankingAndCarbon on ranking page.",
    mergedIntoModuleId: "rank",
  },
  "linked-pages": {
    routeSegment: "linked-pages",
    subNavGroup: "content",
    navLabel: SCAN_MODULE_LABELS["linked-pages"],
    pageTitleLabel: "Linked Pages",
    mergeNote: "Own route.",
  },
  archives: {
    routeSegment: "archives",
    subNavGroup: "content",
    navLabel: SCAN_MODULE_LABELS.archives,
    pageTitleLabel: "Archive History",
    mergeNote: "Own route.",
  },
  "block-lists": {
    routeSegment: null,
    subNavGroup: "security",
    navLabel: SCAN_MODULE_LABELS["block-lists"],
    pageTitleLabel: SCAN_MODULE_LABELS["block-lists"],
    mergeNote: "Backend maps to ScanDetail.threats (block list sources table).",
    mergedIntoModuleId: "threats",
    routeHash: "#block-lists",
  },
  "legacy-rank": {
    routeSegment: null,
    subNavGroup: "content",
    navLabel: SCAN_MODULE_LABELS["legacy-rank"],
    pageTitleLabel: SCAN_MODULE_LABELS["legacy-rank"],
    mergeNote: "Legacy rank merged into rankingAndCarbon.",
    mergedIntoModuleId: "rank",
    routeHash: "#legacy-rank",
  },
  ports: {
    routeSegment: "ports",
    subNavGroup: "network",
    navLabel: SCAN_MODULE_LABELS.ports,
    pageTitleLabel: "Open Ports",
    mergeNote: "Own route.",
  },
  "tech-stack": {
    routeSegment: "tech-stack",
    subNavGroup: "content",
    navLabel: SCAN_MODULE_LABELS["tech-stack"],
    pageTitleLabel: "Tech Stack",
    mergeNote: "Own route.",
  },
  threats: {
    routeSegment: "threats",
    subNavGroup: "security",
    navLabel: "Threats & Block Lists",
    pageTitleLabel: "Threats & Block Lists",
    mergeNote: "Own route; block-lists module feeds same threats payload.",
  },
  "trace-route": {
    routeSegment: "traceroute",
    subNavGroup: "network",
    navLabel: SCAN_MODULE_LABELS["trace-route"],
    pageTitleLabel: "Traceroute",
    mergeNote: "Route segment traceroute.",
  },
  screenshot: {
    routeSegment: "screenshot",
    subNavGroup: "content",
    navLabel: "Screenshot & Page Source",
    pageTitleLabel: "Screenshot & Page Source",
    mergeNote: "SubNav links with #page-source; page-source module merges here.",
    routeHash: "#page-source",
  },
  features: {
    routeSegment: "features",
    subNavGroup: "content",
    navLabel: SCAN_MODULE_LABELS.features,
    pageTitleLabel: "Site Features",
    mergeNote: "Own route.",
  },
  quality: {
    routeSegment: "quality",
    subNavGroup: "content",
    navLabel: SCAN_MODULE_LABELS.quality,
    pageTitleLabel: "Quality",
    mergeNote: "Own route.",
  },
  "dns-server": {
    routeSegment: null,
    subNavGroup: "network",
    navLabel: SCAN_MODULE_LABELS["dns-server"],
    pageTitleLabel: SCAN_MODULE_LABELS["dns-server"],
    mergeNote: "Backend maps to ScanDetail.dns (NS / authority).",
    mergedIntoModuleId: "dns",
    routeHash: "#dns-server",
  },
};

export type SubNavIconKey = "layout" | "shield" | "globe" | "file";

export interface ScanSubNavItemDef {
  segment?: string;
  label: string;
  hrefHash?: string;
}

export interface ScanSubNavGroupDef {
  title: string;
  groupId: ScanSubNavGroupId;
  icon: SubNavIconKey;
  items: ScanSubNavItemDef[];
}

/** Sidebar structure — segments must match app/dashboard/scan/[scanId]/<segment>/page.tsx */
export const SCAN_SUB_NAV_GROUPS: ScanSubNavGroupDef[] = [
  {
    title: "Overview",
    groupId: "overview",
    icon: "layout",
    items: [{ label: "Dashboard Summary" }],
  },
  {
    title: "Security",
    groupId: "security",
    icon: "shield",
    items: [
      { segment: "ssl", label: "SSL Certificate" },
      { segment: "tls", label: "TLS" },
      { segment: "headers", label: "Security Headers" },
      { segment: "hsts", label: "HSTS" },
      { segment: "cookies", label: "Cookies" },
      { segment: "dnssec", label: "DNSSEC" },
      { segment: "firewall", label: "Firewall" },
      { segment: "security-txt", label: "Security.txt" },
      { segment: "threats", label: "Threats & Block Lists" },
    ],
  },
  {
    title: "Network & DNS",
    groupId: "network",
    icon: "globe",
    items: [
      { segment: "ip", label: "IP Info" },
      { segment: "whois", label: "Whois" },
      { segment: "dns", label: "DNS Records" },
      { segment: "ports", label: "Open Ports" },
      { segment: "traceroute", label: "Traceroute" },
      { segment: "redirects", label: "Redirects" },
      { segment: "status", label: "HTTP Status" },
      { segment: "email-config", label: "Email Config" },
      { segment: "associated-hosts", label: "Associated Hosts" },
    ],
  },
  {
    title: "Content & Site",
    groupId: "content",
    icon: "file",
    items: [
      { segment: "quality", label: "Quality" },
      { segment: "screenshot", label: "Screenshot & Page Source", hrefHash: "#page-source" },
      { segment: "tech-stack", label: "Tech Stack" },
      { segment: "features", label: "Features" },
      { segment: "robots-txt", label: "Robots.txt" },
      { segment: "sitemap", label: "Sitemap" },
      { segment: "linked-pages", label: "Linked Pages" },
      { segment: "social-tags", label: "Social Tags" },
      { segment: "archives", label: "Archives" },
      { segment: "ranking", label: "Global Ranking & Carbon" },
    ],
  },
];

/** Breadcrumb / H1 labels keyed by URL segment (pathname index after scanId). */
export const ROUTE_SEGMENT_PAGE_TITLE: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const mod of Object.keys(SCAN_MODULE_ROUTE_MAP) as ScanModuleId[]) {
    const e: ScanModuleRouteEntry = SCAN_MODULE_ROUTE_MAP[mod];
    if (e.routeSegment) {
      map[e.routeSegment] = e.pageTitleLabel;
    }
  }
  // Phase 5 / T5.1: trend page lives under the same scan layout but is not
  // backed by a backend module — register its label here so the breadcrumb
  // / H1 stay consistent with the rest of the scan-detail nav.
  map["trend"] = "Domain Trend";
  return map;
})();

/**
 * Resolves URL segment and hash for a backend module id (jobs, deep links).
 * Walks mergedIntoModuleId until a routeSegment is found; accumulates routeHash from the chain.
 */
export function resolveModuleHrefParts(moduleId: ScanModuleId): { segment: string; hash: string } {
  let cur: ScanModuleId | undefined = moduleId;
  let hash = "";
  const maxSteps = 32;

  for (let i = 0; i < maxSteps && cur; i++) {
    const e: ScanModuleRouteEntry = SCAN_MODULE_ROUTE_MAP[cur];
    if (e.routeHash) {
      hash = e.routeHash;
    }
    if (e.routeSegment) {
      return { segment: e.routeSegment, hash };
    }
    cur = e.mergedIntoModuleId;
  }

  throw new Error(`No route segment resolved for module: ${moduleId}`);
}

export function getModuleDetailHref(scanId: string, moduleId: string): string | null {
  const list = Object.keys(SCAN_MODULE_ROUTE_MAP);
  if (!list.includes(moduleId)) {
    return null;
  }
  const { segment, hash } = resolveModuleHrefParts(moduleId as ScanModuleId);
  const base = `/dashboard/scan/${scanId}/${segment}`;
  return hash ? `${base}${hash}` : base;
}

/**
 * Pathname is /dashboard/scan/[scanId]/[segment?]; module segment is index 3 (0-based).
 */
export function getPageLabelFromPathname(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const moduleSegment = segments[3];
  if (!moduleSegment) {
    return "Dashboard Summary";
  }
  return ROUTE_SEGMENT_PAGE_TITLE[moduleSegment] ?? "Dashboard Summary";
}
