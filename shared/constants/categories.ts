import type { ScanModuleName } from "./modules";

export interface ModuleCategory {
  id: "security" | "network" | "content";
  label: string;
  modules: ScanModuleName[];
}

export const SCAN_CATEGORIES: ModuleCategory[] = [
  {
    id: "security",
    label: "Security",
    modules: [
      "ssl",
      "tls",
      "headers",
      "http-security",
      "hsts",
      "cookies",
      "dnssec",
      "firewall",
      "security-txt",
      "threats",
      "block-lists",
    ],
  },
  {
    id: "network",
    label: "Network & DNS",
    modules: [
      "get-ip",
      "whois",
      "dns",
      "dns-server",
      "txt-records",
      "ports",
      "trace-route",
      "redirects",
      "status",
      "mail-config",
    ],
  },
  {
    id: "content",
    label: "Content & Site",
    modules: [
      "screenshot",
      "tech-stack",
      "features",
      "robots-txt",
      "sitemap",
      "linked-pages",
      "social-tags",
      "archives",
      "rank",
      "carbon",
      "legacy-rank",
      "quality",
    ],
  },
];
