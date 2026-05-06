/**
 * All scan module names as used by the Scan Service (Express).
 * These are the kebab-case identifiers used in API paths.
 */

export const SCAN_MODULES = [
  "archives",
  "associated-hosts",
  "block-lists",
  "carbon",
  "cookies",
  "dns",
  "dns-server",
  "dnssec",
  "features",
  "firewall",
  "get-ip",
  "headers",
  "hsts",
  "http-security",
  "legacy-rank",
  "linked-pages",
  "mail-config",
  "page-source",
  "ports",
  "quality",
  "rank",
  "redirects",
  "robots-txt",
  "screenshot",
  "security-txt",
  "sitemap",
  "social-tags",
  "ssl",
  "status",
  "tech-stack",
  "threats",
  "tls",
  "trace-route",
  "txt-records",
  "whois",
] as const;

export type ScanModuleName = (typeof SCAN_MODULES)[number];

/**
 * Maps scan module name → frontend ScanDetail property key.
 * Modules that merge into another key share the same value.
 * null = no frontend page (stored as raw only).
 *
 * IMPORTANT: keys must match `backend/app/services/transformers.py`
 * `MODULE_TO_FRONTEND_KEY`. Drift between the two breaks the
 * ScanDetail contract.
 */
export const MODULE_TO_FRONTEND_KEY: Record<ScanModuleName, string | null> = {
  ssl: "ssl",
  headers: "headers",
  "http-security": "headers",
  hsts: "hsts",
  cookies: "cookies",
  dnssec: "dnssec",
  firewall: "firewall",
  "security-txt": "securityTxt",
  threats: "threats",
  "block-lists": "threats",
  tls: "tls",
  "get-ip": "ip",
  whois: "whois",
  dns: "dns",
  "dns-server": "dns",
  "txt-records": "dns",
  ports: "ports",
  "trace-route": "traceroute",
  redirects: "redirects",
  status: "statusCheck",
  "mail-config": "emailConfig",
  screenshot: "screenshot",
  "page-source": "pageSource",
  "tech-stack": "techStack",
  features: "features",
  "robots-txt": "robotsTxt",
  sitemap: "sitemap",
  "linked-pages": "linkedPages",
  "social-tags": "socialTags",
  archives: "archives",
  rank: "rankingAndCarbon",
  carbon: "rankingAndCarbon",
  "legacy-rank": "rankingAndCarbon",
  quality: "quality",
  "associated-hosts": "associatedHosts",
};

/**
 * Frontend ScanDetail property key → display label.
 */
export const FRONTEND_KEY_LABELS: Record<string, string> = {
  ssl: "SSL Certificate",
  headers: "HTTP Headers",
  hsts: "HSTS",
  cookies: "Cookies",
  dnssec: "DNSSEC",
  firewall: "Firewall / WAF",
  securityTxt: "Security.txt",
  threats: "Threats",
  tls: "TLS",
  ip: "IP Info",
  whois: "WHOIS",
  dns: "DNS Records",
  ports: "Open Ports",
  traceroute: "Traceroute",
  redirects: "Redirects",
  statusCheck: "HTTP Status",
  emailConfig: "Email Config",
  screenshot: "Screenshot",
  pageSource: "Page Source",
  techStack: "Tech Stack",
  features: "Features",
  robotsTxt: "Robots.txt",
  sitemap: "Sitemap",
  linkedPages: "Linked Pages",
  socialTags: "Social Tags",
  archives: "Web Archives",
  rankingAndCarbon: "Ranking & Carbon",
  associatedHosts: "Associated Hosts",
  quality: "Quality",
};
