import type { PortsResult, RecentScan, ScanDetail, ScanResultCardData } from "@/shared/types/scan";

export type {
  ArchiveSnapshot,
  ArchivesResult,
  AssociatedHost,
  AssociatedHostsResult,
  CarbonResult,
  CategorySummary,
  CookieItem,
  CookiesResult,
  DnsResult,
  DnssecResult,
  EmailConfigResult,
  FeatureItem,
  FeaturesResult,
  FirewallResult,
  HeaderCheck,
  HeadersResult,
  HstsResult,
  IpInfoResult,
  KeyFinding,
  LinkedPage,
  LinkedPagesResult,
  MxRecord,
  PortResult,
  RankingAndCarbonResult,
  RankingResult,
  RecentScan,
  RedirectHop,
  RedirectsResult,
  RobotsTxtResult,
  ScanDetail,
  ScanResultCardData,
  ScanSeverity,
  ScreenshotResult,
  SecurityTxtResult,
  SeverityCounts,
  SocialTagsResult,
  SitemapResult,
  SslResult,
  StatusResult,
  TechStackItem,
  ThreatEntry,
  ThreatsResult,
  TlsResult,
  TracerouteHop,
  TracerouteResult,
  WhoisResult,
} from "@/shared/types/scan";

// === Settings ===

export interface ApiProvider {
  id: string;
  name: string;
  description: string;
  placeholder: string;
  storageKey: string;
}

export const API_PROVIDERS: ApiProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, GPT-4, GPT-3.5 models",
    placeholder: "sk-proj-...",
    storageKey: "orbicheck_apikey_openai",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude 4, Sonnet, Haiku models",
    placeholder: "sk-ant-...",
    storageKey: "orbicheck_apikey_anthropic",
  },
  {
    id: "google",
    name: "Google AI",
    description: "Gemini Pro, Gemini Flash models",
    placeholder: "AIza...",
    storageKey: "orbicheck_apikey_google",
  },
];

export const APPEARANCE_KEYS = {
  fontSize: "orbicheck_font_size",
  language: "orbicheck_language",
} as const;

export const MOCK_STATS = {
  totalScans: 12,
  totalScansTrend: "+3 this week",
  vulnerabilities: 47,
  vulnsTrend: "+8 this week",
  uptimePercent: 99.2,
  uptimeTrend: "Stable",
  activeAlerts: 3,
  alertsTrend: "-2 resolved",
};

export const MOCK_RECENT_SCANS: RecentScan[] = [
  {
    id: "scan-001",
    domain: "example.com",
    url: "https://example.com",
    status: "completed",
    vulnCount: 5,
    createdAt: "2 hours ago",
  },
  {
    id: "scan-002",
    domain: "test-app.io",
    url: "https://test-app.io",
    status: "completed",
    vulnCount: 0,
    createdAt: "5 hours ago",
  },
  {
    id: "scan-003",
    domain: "staging.mysite.dev",
    url: "https://staging.mysite.dev",
    status: "running",
    vulnCount: 2,
    createdAt: "1 day ago",
  },
  {
    id: "scan-004",
    domain: "api.service.com",
    url: "https://api.service.com",
    status: "failed",
    vulnCount: 0,
    createdAt: "2 days ago",
  },
  {
    id: "scan-005",
    domain: "shop.example.org",
    url: "https://shop.example.org",
    status: "completed",
    vulnCount: 12,
    createdAt: "3 days ago",
  },
];

export const MOCK_SCAN_RESULT: ScanResultCardData = {
  score: 72,
  duration: "5.0s",
  severity: {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
  },
  reportHref: "/dashboard/scan/scan-001",
};

const MOCK_PORTS_DETAIL: PortsResult = {
  engine: "nmap",
  profile: "standard",
  method: "nmap -sT -sV -O -T3 --top-ports 1000",
  durationMs: 12345,
  detectedTechnologies: ["OpenSSH", "nginx"],
  osFingerprint: "Linux 2.6.32 - 3.10",
  entries: [
    { port: 80, protocol: "tcp", service: "http", state: "open", banner: "nginx 1.24.0", version: "nginx 1.24.0", product: "nginx", extraInfo: "Ubuntu" },
    { port: 443, protocol: "tcp", service: "https", state: "open", banner: "nginx tls1.3", version: "nginx 1.24.0", product: "nginx" },
    { port: 22, protocol: "tcp", service: "ssh", state: "open", banner: "OpenSSH_8.4", version: "OpenSSH 8.4", product: "OpenSSH", extraInfo: "protocol 2.0" },
    { port: 25, protocol: "tcp", service: "smtp", state: "filtered", banner: "" },
    { port: 3306, protocol: "tcp", service: "mysql", state: "closed", banner: "" },
  ],
  osDetection: {
    osMatches: [
      {
        name: "Linux 2.6.32 - 3.10",
        accuracy: 95,
        osClasses: [
          { vendor: "Linux", osFamily: "Linux", osGen: "2.6.X", type: "general purpose", accuracy: 95 },
        ],
      },
    ],
    deviceType: "general purpose",
    uptimeSeconds: 2042496,
    uptimeLastBoot: "Mon Mar 14 10:23:45 2026",
    tcpSequenceDifficulty: 206,
    tcpSequenceDescription: "Good luck!",
    ipIdSequence: "All zeros",
    networkDistance: 12,
  },
  scanStats: {
    startTime: "Tue Apr 07 09:24:00 2026",
    endTime: "Tue Apr 07 09:24:12 2026",
    elapsedSeconds: 12.35,
    hostsUp: 1,
    hostsTotal: 1,
  },
};

export const MOCK_SCAN_DETAIL: ScanDetail = {
  id: "scan-001",
  domain: "example.com",
  url: "https://example.com",
  scannedAt: "2026-03-12 09:24 UTC",
  duration: "5.0s",
  status: "completed",
  securityScore: 72,
  severity: {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
  },
  categorySummary: [
    { category: "security", label: "Security", modulesChecked: 9, issuesFound: 5, status: "fail" },
    { category: "network", label: "Network & DNS", modulesChecked: 9, issuesFound: 3, status: "warn" },
    { category: "content", label: "Content & Site", modulesChecked: 9, issuesFound: 2, status: "warn" },
  ],
  keyFindings: [
    {
      id: "finding-001",
      severity: "critical",
      module: "Headers",
      title: "Missing CSP header",
      description: "Content-Security-Policy is absent, increasing XSS injection risk.",
    },
    {
      id: "finding-002",
      severity: "high",
      module: "SSL",
      title: "Certificate expires soon",
      description: "TLS certificate has less than 30 days remaining before expiration.",
    },
    {
      id: "finding-003",
      severity: "high",
      module: "Ports",
      title: "Administrative service exposed",
      description: "SSH banner is publicly reachable and reveals server software details.",
    },
    {
      id: "finding-004",
      severity: "medium",
      module: "Status",
      title: "Redirect chain detected",
      description: "Multiple redirects increase latency and can obscure final endpoint behavior.",
    },
    {
      id: "finding-005",
      severity: "medium",
      module: "DNS",
      title: "SPF policy is permissive",
      description: "SPF record includes broad hosts, reducing trust in strict sender validation.",
    },
    {
      id: "finding-006",
      severity: "low",
      module: "Tech Stack",
      title: "Legacy library fingerprint",
      description: "Detected JavaScript dependency appears behind latest security patch.",
    },
  ],
  moduleErrors: {},
  ssl: {
    grade: "A",
    issuer: "R3 / Let's Encrypt",
    subject: "CN=example.com",
    validFrom: "2026-02-15",
    validTo: "2026-04-18",
    daysRemaining: 37,
    chainDepth: 3,
    keySize: 2048,
    signatureAlgorithm: "SHA256withRSA",
    sans: ["example.com", "www.example.com", "cdn.example.com"],
    chain: ["example.com", "R3", "ISRG Root X1"],
  },
  headers: {
    overallGrade: "C",
    responseHeaders: {
      server: "nginx/1.24.0",
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "public, max-age=300",
      "x-powered-by": "Next.js",
    },
    securityChecks: [
      { name: "Content-Security-Policy", status: "missing", recommendation: "Define strict script-src and object-src policies." },
      { name: "X-Frame-Options", status: "pass", value: "DENY" },
      { name: "X-Content-Type-Options", status: "pass", value: "nosniff" },
      { name: "Strict-Transport-Security", status: "fail", value: "max-age=300", recommendation: "Increase max-age to at least 31536000 with preload consideration." },
      { name: "Referrer-Policy", status: "pass", value: "strict-origin-when-cross-origin" },
      { name: "Permissions-Policy", status: "missing", recommendation: "Explicitly disable unused browser capabilities." },
    ],
  },
  ip: {
    ip: "93.184.216.34",
    asn: "AS15133",
    isp: "EdgeCast Networks",
    country: "United States",
    city: "Los Angeles",
    hostingProvider: "Akamai",
    ipType: "cdn",
  },
  whois: {
    registrar: "IANA Reserved Domains",
    createdAt: "1995-08-13",
    updatedAt: "2025-07-29",
    expiresAt: "2027-08-12",
    nameservers: ["a.iana-servers.net", "b.iana-servers.net"],
    domainStatus: ["clientTransferProhibited", "serverDeleteProhibited"],
  },
  dns: {
    a: ["93.184.216.34"],
    aaaa: ["2606:2800:220:1:248:1893:25c8:1946"],
    cname: ["www.example.com -> example.com"],
    mx: ["10 mail.example.com"],
    ns: ["a.iana-servers.net", "b.iana-servers.net"],
    txt: ["v=spf1 include:_spf.example.com ~all", "google-site-verification=abc123"],
    soa: ["ns.icann.org hostmaster.icann.org 2026031201 7200 3600 1209600 3600"],
  },
  ports: MOCK_PORTS_DETAIL,
  statusCheck: {
    httpStatusCode: 200,
    responseTimeMs: 242,
    serverHeader: "nginx",
    contentType: "text/html; charset=UTF-8",
    redirectCount: 1,
  },
  screenshot: {
    imageUrl: "https://placehold.co/1280x720/18181b/e4e4e7?text=example.com",
    viewport: "1280x720",
    capturedAt: "2026-03-12 09:24:03 UTC",
  },
  techStack: [
    { name: "Next.js", category: "Framework", version: "14.2.35", confidence: 94 },
    { name: "React", category: "Frontend", version: "18", confidence: 96 },
    { name: "Nginx", category: "Web Server", version: "1.24.0", confidence: 89 },
    { name: "Tailwind CSS", category: "Styling", version: "3.4.1", confidence: 82 },
    { name: "Cloudflare", category: "CDN", confidence: 74 },
  ],
  tls: {
    grade: "A+",
    score: 95,
    protocols: [
      { name: "TLSv1.3", supported: true, secure: "good" },
      { name: "TLSv1.2", supported: true, secure: "good" },
      { name: "TLSv1.1", supported: false, secure: "warning" },
      { name: "TLSv1.0", supported: false, secure: "warning" },
      { name: "SSLv3", supported: false, secure: "danger" },
    ],
    cipherSuites: [
      {
        name: "TLS_AES_256_GCM_SHA384",
        protocol: "TLSv1.3",
        strength: "strong",
        encryption: "AES-256-GCM",
        mac: "SHA384",
        forwardSecrecy: true,
      },
      {
        name: "TLS_CHACHA20_POLY1305_SHA256",
        protocol: "TLSv1.3",
        strength: "strong",
        forwardSecrecy: true,
      },
      {
        name: "TLS_AES_128_GCM_SHA256",
        protocol: "TLSv1.3",
        strength: "acceptable",
        forwardSecrecy: true,
      },
      {
        name: "TLS_RSA_WITH_AES_128_CBC_SHA",
        protocol: "TLSv1.2",
        strength: "weak",
        keyExchange: "RSA",
        forwardSecrecy: false,
      },
    ],
    cipherStats: {
      total: 4,
      weakCount: 1,
      forwardSecrecyPercent: 75,
      aeadPercent: 75,
    },
    preferredProtocol: "TLSv1.3",
    sessionResumption: true,
  },
  hsts: {
    enabled: true,
    preloadReady: true,
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
    rawHeader: "max-age=31536000; includeSubDomains; preload",
  },
  cookies: {
    cookies: [
      {
        name: "session_id",
        domain: ".example.com",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "strict",
        expires: "Session",
      },
      {
        name: "consent",
        domain: "example.com",
        path: "/",
        secure: true,
        httpOnly: false,
        sameSite: "lax",
        expires: "2026-12-31",
      },
      {
        name: "analytics_id",
        domain: ".example.com",
        path: "/",
        secure: false,
        httpOnly: false,
        sameSite: "none",
        expires: "2027-03-12",
      },
      {
        name: "pref_locale",
        domain: "example.com",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "lax",
        expires: "2026-09-12",
      },
    ],
    issuesCount: 2,
  },
  firewall: {
    detected: true,
    provider: "Cloudflare",
    confidence: 92,
    evidence: "Detected cf-ray header and known Cloudflare edge response signatures.",
  },
  threats: {
    entries: [
      { source: "Google Safe Browsing", listed: false, detail: "No match found for domain." },
      { source: "PhishTank", listed: false, detail: "Domain not present in current feed." },
      { source: "Spamhaus DBL", listed: false, detail: "No listing detected." },
      { source: "AbuseIPDB", listed: false, detail: "No associated malicious reports." },
    ],
    listedCount: 0,
  },
  redirects: {
    hops: [
      { url: "http://example.com", statusCode: 301, responseTimeMs: 51 },
      { url: "https://example.com", statusCode: 302, responseTimeMs: 63 },
      { url: "https://www.example.com", statusCode: 200, responseTimeMs: 128 },
    ],
    totalRedirects: 2,
    finalUrl: "https://www.example.com",
  },
  emailConfig: {
    mxRecords: [
      { priority: 20, host: "alt1.aspmx.l.google.com" },
      { priority: 10, host: "aspmx.l.google.com" },
      { priority: 30, host: "alt2.aspmx.l.google.com" },
    ],
    spf: { raw: "v=spf1 include:_spf.google.com ~all", status: "pass" },
    dkim: { found: true, selector: "google" },
    dmarc: { raw: "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com", policy: "quarantine", status: "pass" },
  },
  features: {
    features: [
      { name: "Service Worker", detected: true, category: "JavaScript" },
      { name: "Google Analytics", detected: true, category: "Analytics" },
      { name: "Content Security Policy", detected: false, category: "Security" },
      { name: "OpenGraph Metadata", detected: true, category: "SEO" },
      { name: "Structured Data (JSON-LD)", detected: true, category: "SEO" },
      { name: "SRI for Static Assets", detected: false, category: "Security" },
    ],
  },
  robotsTxt: {
    exists: true,
    rawContent: "User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /internal\nSitemap: https://example.com/sitemap.xml",
    allowedPaths: ["/"],
    disallowedPaths: ["/admin", "/internal"],
    sitemapUrls: ["https://example.com/sitemap.xml"],
  },
  sitemap: {
    exists: true,
    url: "https://example.com/sitemap.xml",
    urlCount: 124,
    sampleUrls: [
      "https://example.com/",
      "https://example.com/about",
      "https://example.com/contact",
      "https://example.com/blog",
      "https://example.com/blog/security-basics",
      "https://example.com/blog/tls-hardening",
      "https://example.com/pricing",
      "https://example.com/docs/getting-started",
      "https://example.com/docs/api/authentication",
      "https://example.com/docs/api/rate-limits",
    ],
  },
  dnssec: {
    enabled: true,
    valid: true,
    dsRecords: [
      "2371 13 2 3F9C5A2B78C9A1EB8B8A14A6CC17B0E5A5FA2D2F0F8C2A3DEBCE8D458421E781",
      "2371 13 4 9E0AA99373AC447A909F1E2BC41EA10D5B43B21D3CD7FC995C18B87F4DA1B830E5D6E12A33D177D61395A7E0B537C913",
    ],
    dnskeyRecords: [
      "256 3 13 fP4M7N6f6fU9d6L2mH9w6m11p2a5F7G2sA6mP1yJxE4=",
      "257 3 13 qL8rT1qV8b6F0Q2mW3K1rD2xS8pA9fJ4zM1bV6kP0sN=",
    ],
    algorithm: "ECDSAP256SHA256",
    keyTag: 2371,
  },
  securityTxt: {
    exists: true,
    url: "https://example.com/.well-known/security.txt",
    rawContent:
      "Contact: mailto:security@example.com\nExpires: 2026-12-31T23:59:59Z\nEncryption: https://example.com/pgp-key.txt\nAcknowledgments: https://example.com/hall-of-fame\nPreferred-Languages: en, zh-TW\nPolicy: https://example.com/security-policy",
    contact: "mailto:security@example.com",
    expires: "2026-12-31T23:59:59Z",
    encryption: "https://example.com/pgp-key.txt",
    acknowledgments: "https://example.com/hall-of-fame",
    preferredLanguages: "en, zh-TW",
    policy: "https://example.com/security-policy",
  },
  traceroute: {
    hops: [
      { hop: 1, address: "192.168.1.1", ip: "192.168.1.1", hostname: "router.local", rttMs: 1.6 },
      { hop: 2, address: "10.32.0.1", ip: "10.32.0.1", hostname: undefined, rttMs: 4.8 },
      { hop: 3, address: "100.72.4.1", ip: "100.72.4.1", hostname: "core1.isp.net", rttMs: 8.1 },
      { hop: 4, address: "198.18.5.22", ip: "198.18.5.22", hostname: "edge-lax1.isp.net", rttMs: 13.4 },
      { hop: 5, address: "203.0.113.44", ip: "203.0.113.44", hostname: "akamai-gw.lax.example", rttMs: 19.7 },
      { hop: 6, address: "93.184.216.34", ip: "93.184.216.34", hostname: "example.com", rttMs: 24.1 },
    ],
    totalHops: 6,
    destinationReached: true,
  },
  associatedHosts: {
    hosts: [
      { hostname: "www.example.com", source: "same-ip", ip: "93.184.216.34" },
      { hostname: "cdn.example.com", source: "certificate", ip: "93.184.216.34" },
      { hostname: "api.example.com", source: "certificate", ip: "93.184.216.34" },
      { hostname: "mail.example.com", source: "reverse-dns", ip: "93.184.216.35" },
      { hostname: "status.example.com", source: "same-ip", ip: "93.184.216.34" },
    ],
    totalFound: 5,
  },
  linkedPages: {
    internal: [
      { url: "https://example.com/about", text: "About", type: "internal" },
      { url: "https://example.com/contact", text: "Contact Us", type: "internal" },
      { url: "https://example.com/docs", text: "Documentation", type: "internal" },
      { url: "https://example.com/pricing", text: "Pricing", type: "internal" },
    ],
    external: [
      { url: "https://www.iana.org/domains/example", text: "IANA Reserved Domains", type: "external" },
      { url: "https://github.com/example", text: "GitHub", type: "external" },
      { url: "https://status.examplecdn.net", text: "CDN Status", type: "external" },
    ],
    totalInternal: 4,
    totalExternal: 3,
  },
  socialTags: {
    ogTitle: "Example Domain - Security First Web Platform",
    ogDescription: "Example Domain provides reference content, security guidance, and API examples.",
    ogImage: "https://example.com/assets/og/example-social-card.png",
    ogUrl: "https://example.com",
    ogType: "website",
    ogSiteName: "Example Domain",
    twitterCard: "summary_large_image",
    twitterSite: "@example",
    twitterTitle: "Example Domain",
    twitterDescription: "Reference domain for demos, docs, and security testing workflows.",
    twitterImage: "https://example.com/assets/og/example-social-card.png",
  },
  archives: {
    totalSnapshots: 146,
    oldestSnapshot: "2018-04-13T09:42:18Z",
    newestSnapshot: "2026-02-20T11:10:02Z",
    snapshots: [
      {
        timestamp: "2026-02-20T11:10:02Z",
        url: "https://web.archive.org/web/20260220111002/https://example.com",
        statusCode: 200,
      },
      {
        timestamp: "2025-12-02T07:34:19Z",
        url: "https://web.archive.org/web/20251202073419/https://example.com",
        statusCode: 200,
      },
      {
        timestamp: "2025-06-08T14:03:01Z",
        url: "https://web.archive.org/web/20250608140301/https://example.com",
        statusCode: 301,
      },
      {
        timestamp: "2024-11-15T03:27:55Z",
        url: "https://web.archive.org/web/20241115032755/https://example.com",
        statusCode: 200,
      },
      {
        timestamp: "2024-03-09T20:16:44Z",
        url: "https://web.archive.org/web/20240309201644/https://example.com",
        statusCode: 200,
      },
      {
        timestamp: "2023-07-21T18:42:17Z",
        url: "https://web.archive.org/web/20230721184217/https://example.com",
        statusCode: 404,
      },
      {
        timestamp: "2022-12-30T05:50:10Z",
        url: "https://web.archive.org/web/20221230055010/https://example.com",
        statusCode: 200,
      },
      {
        timestamp: "2021-10-12T09:11:33Z",
        url: "https://web.archive.org/web/20211012091133/https://example.com",
        statusCode: 302,
      },
      {
        timestamp: "2020-05-04T22:05:48Z",
        url: "https://web.archive.org/web/20200504220548/https://example.com",
        statusCode: 200,
      },
      {
        timestamp: "2018-04-13T09:42:18Z",
        url: "https://web.archive.org/web/20180413094218/https://example.com",
        statusCode: 200,
      },
    ],
  },
  rankingAndCarbon: {
    ranking: {
      globalRank: 14329,
      countryRank: 4201,
      country: "United States",
      categoryRank: 188,
      category: "Reference",
    },
    carbon: {
      isGreen: true,
      co2PerPageview: 0.48,
      cleanerThanPercent: 72,
      energyPerVisit: 0.0009,
    },
  },
};

const MOCK_SCAN_DETAILS: Record<string, ScanDetail> = {
  "scan-001": MOCK_SCAN_DETAIL,
};

export function getScanById(scanId: string): RecentScan | undefined {
  return MOCK_RECENT_SCANS.find((scan) => scan.id === scanId);
}

export function getScanDetail(scanId: string): ScanDetail | undefined {
  const detail = MOCK_SCAN_DETAILS[scanId];
  if (detail) {
    return detail;
  }

  const scan = getScanById(scanId);
  if (!scan) {
    return undefined;
  }

  return {
    ...MOCK_SCAN_DETAIL,
    id: scan.id,
    domain: scan.domain,
    url: scan.url,
    status: scan.status,
  };
}
