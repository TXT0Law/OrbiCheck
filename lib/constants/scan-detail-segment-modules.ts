/**
 * Maps SubNav URL segment to backend scan module names (ALL_MODULES / retry API).
 * Used for sub-page module retry banner and must stay aligned with transformers merge rules.
 */
export const SCAN_DETAIL_SEGMENT_BACKEND_MODULES = {
  ssl: ["ssl"],
  tls: ["tls"],
  headers: ["headers", "http-security"],
  hsts: ["hsts"],
  cookies: ["cookies"],
  dnssec: ["dnssec"],
  firewall: ["firewall"],
  "security-txt": ["security-txt"],
  threats: ["threats", "block-lists"],
  ip: ["get-ip"],
  whois: ["whois"],
  dns: ["dns", "txt-records", "dns-server"],
  ports: ["ports"],
  traceroute: ["trace-route"],
  redirects: ["redirects"],
  status: ["status"],
  "email-config": ["mail-config"],
  "associated-hosts": ["associated-hosts"],
  quality: ["quality"],
  screenshot: ["screenshot", "page-source"],
  "tech-stack": ["tech-stack"],
  features: ["features"],
  "robots-txt": ["robots-txt"],
  sitemap: ["sitemap"],
  "linked-pages": ["linked-pages"],
  "social-tags": ["social-tags"],
  archives: ["archives"],
  ranking: ["rank", "carbon", "legacy-rank"],
} as const;

export type ScanDetailNavSegment = keyof typeof SCAN_DETAIL_SEGMENT_BACKEND_MODULES;

/** SubNav-enabled segments (excludes Summary root). */
export const SCAN_DETAIL_NAV_SEGMENTS: ScanDetailNavSegment[] = [
  "ssl",
  "tls",
  "headers",
  "hsts",
  "cookies",
  "dnssec",
  "firewall",
  "security-txt",
  "threats",
  "ip",
  "whois",
  "dns",
  "ports",
  "traceroute",
  "redirects",
  "status",
  "email-config",
  "associated-hosts",
  "quality",
  "screenshot",
  "tech-stack",
  "features",
  "robots-txt",
  "sitemap",
  "linked-pages",
  "social-tags",
  "archives",
  "ranking",
];

export function parseScanDetailSegment(pathname: string, scanId: string): ScanDetailNavSegment | null {
  const trimmed = pathname.replace(/\/$/, "");
  const prefix = `/dashboard/scan/${scanId}`;
  if (trimmed === prefix) {
    return null;
  }
  if (!trimmed.startsWith(`${prefix}/`)) {
    return null;
  }
  const rest = trimmed.slice(prefix.length + 1);
  const segment = rest.split("/")[0];
  if (!segment || !(segment in SCAN_DETAIL_SEGMENT_BACKEND_MODULES)) {
    return null;
  }
  return segment as ScanDetailNavSegment;
}
