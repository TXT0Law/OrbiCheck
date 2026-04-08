export interface RecentScan {
  id: string;
  domain: string;
  url: string;
  status: "completed" | "running" | "failed";
  vulnCount: number;
  createdAt: string;
}

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export type ScanSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface CategorySummary {
  category: "security" | "network" | "content";
  label: string;
  modulesChecked: number;
  issuesFound: number;
  status: "pass" | "warn" | "fail";
}

export interface KeyFinding {
  id: string;
  severity: ScanSeverity;
  module: string;
  title: string;
  description: string;
}

// ────────────────────────────────────────────
// SSL Check sub-types (expanded for full assessment)
// ────────────────────────────────────────────

/** Certificate chain entry */
export interface ChainInfo {
  subject: string;
  issuer: string;
  order: number;
  isTrusted?: boolean;
}

/** TLS protocol version */
export interface ProtocolInfo {
  name: string;
  supported: boolean;
  /**
   * Security classification:
   * - good: TLSv1.2, TLSv1.3
   * - warning: TLSv1.0, TLSv1.1 (deprecated)
   * - danger: SSLv2, SSLv3
   */
  secure: "good" | "warning" | "danger";
}

/** Individual cipher suite information with parsed components. */
export interface CipherInfo {
  /** Full IANA cipher suite name, e.g. TLS_AES_256_GCM_SHA384 */
  name: string;
  /** TLS protocol version this cipher is used with */
  protocol: string;
  /** Security strength classification */
  strength: "strong" | "acceptable" | "weak" | "insecure";
  /** Key exchange algorithm, e.g. ECDHE, DHE, RSA */
  keyExchange?: string;
  /** Authentication algorithm, e.g. RSA, ECDSA */
  auth?: string;
  /** Bulk encryption algorithm, e.g. AES256-GCM */
  encryption?: string;
  /** MAC algorithm, e.g. SHA384 */
  mac?: string;
  /** Whether this cipher provides forward secrecy */
  forwardSecrecy?: boolean;
}

/** Aggregate statistics for cipher suites. */
export interface TlsCipherStats {
  total: number;
  weakCount: number;
  forwardSecrecyPercent: number;
  aeadPercent: number;
}

/** TLS configuration parameters. */
export interface TlsConfig {
  secureRenegotiation?: boolean;
  tlsCompression?: boolean;
  scsv?: boolean;
  alpn?: string[];
  sni?: boolean;
}

/** Handshake simulation for a specific client. */
export interface HandshakeSimulationResult {
  client: string;
  supported: boolean;
  protocol?: string;
  cipher?: string;
}

/** Known vulnerability check result */
export interface VulnerabilityInfo {
  id: string;
  name: string;
  status: "vulnerable" | "not-vulnerable" | "unknown";
}

/** OCSP/CRL signals from TLS + certificate scan data (avoid equating stapling with OCSP availability). */
export interface RevocationInfo {
  ocsp: {
    /** OCSP stapling observed on the TLS connection (Mozilla TLS scan). */
    stapled?: boolean | null;
    /** Certificate / scan payload lists an OCSP responder URL (AIA). Omitted when unknown. */
    responderUrlListed?: boolean | null;
    mustStaple?: boolean;
  };
  /** Omitted on legacy or malformed payloads; UI must treat as absent. */
  crl?: {
    /** True: CDP seen; False: inspected cert data, no CDP; omitted/undefined: not determined. */
    distributionPointListed?: boolean | null;
  };
}

/** Key certificate extensions */
export interface CertExtensions {
  basicConstraints?: string;
  keyUsage?: string[];
  extendedKeyUsage?: string[];
  authorityInfoAccess?: {
    ocsp?: string;
    caIssuers?: string;
  };
  subjectKeyIdentifier?: string;
  authorityKeyIdentifier?: string;
}

// ────────────────────────────────────────────
// SslCheckResult (extended from legacy SslResult)
// ────────────────────────────────────────────

export interface SslCheckResult {
  // === Legacy SslResult fields (backward compatible) ===
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  chainDepth: number;
  keySize: number;
  signatureAlgorithm: string;
  sans: string[];
  chain: string[];

  // === 1. Certificate Chain ===
  chainComplete?: boolean;
  chainOrderValid?: boolean;
  chainDetails?: ChainInfo[];

  // === 2. Revocation ===
  revocation?: RevocationInfo;

  // === 3. Name Validation ===
  cnMatchesSan?: boolean;
  wildcardScope?: string | null;

  // === 4. Protocol Support ===
  protocols?: ProtocolInfo[];

  // === 5. Cipher Suites ===
  cipherSuites?: CipherInfo[];
  forwardSecrecy?: boolean;

  // === 6. Vulnerabilities ===
  vulnerabilities?: VulnerabilityInfo[];

  // === 7. Certificate Type ===
  certType?: "DV" | "OV" | "EV";

  // === 8. HSTS ===
  hsts?: {
    enabled: boolean;
    maxAge?: number;
    preload?: boolean;
    includeSubDomains?: boolean;
  };

  // === 9. Certificate Transparency ===
  ct?: {
    hasSct: boolean;
    logCount?: number;
  };

  // === 10. DNS CAA ===
  caa?: string[];

  // === 11. Server Config ===
  secureRenegotiation?: boolean;
  tlsCompression?: boolean;

  // === 12. Extensions ===
  extensions?: CertExtensions;

  // === 13. Certificate Identity (from Node.js / TLS API) ===
  /** ASN.1 curve name (e.g. prime256v1) for EC certificates */
  asn1Curve?: string | null;
  /** NIST curve name (e.g. P-256) for EC certificates */
  nistCurve?: string | null;
  /** Certificate serial number (hex string) */
  serialNumber?: string | null;
  /** SHA-1 fingerprint (colon-separated hex) */
  fingerprint?: string | null;
  /** Date when cert was issued/renewed (same as validFrom for current cert) */
  renewed?: string | null;
}

/** Backward-compatible alias */
export type SslResult = SslCheckResult;

export interface HeaderCheck {
  name: string;
  status: "pass" | "fail" | "missing";
  value?: string;
  recommendation?: string;
}

export interface HeadersResult {
  overallGrade: "A" | "B" | "C" | "D" | "F";
  responseHeaders: Record<string, string>;
  securityChecks: HeaderCheck[];
}

export interface IpInfoResult {
  ip: string;
  asn: string;
  isp: string;
  country: string;
  countryCode?: string;
  city: string;
  region?: string;
  org?: string;
  lat?: number;
  lon?: number;
  hostingProvider: string;
  ipType: "datacenter" | "residential" | "cdn";
  isHosting?: boolean;
}

export interface WhoisResult {
  registrar: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  nameservers: string[];
  domainStatus: string[];
}

export interface DnsResult {
  a: string[];
  aaaa: string[];
  cname: string[];
  mx: string[];
  ns: string[];
  txt: string[];
  soa: string[];
  dnsServer?: {
    name: string;
    ip: string;
  };
}

export interface PortResult {
  port: number;
  protocol: "tcp" | "udp";
  service: string;
  state: "open" | "closed" | "filtered";
  reason?: string;
  banner: string;
  version?: string;
  product?: string;
  extraInfo?: string;
  scripts?: Record<string, string>;
}

export interface OsClass {
  vendor: string;
  osFamily: string;
  osGen: string;
  type: string;
  accuracy: number;
}

export interface OsMatch {
  name: string;
  accuracy: number;
  osClasses?: OsClass[];
}

export interface OsDetection {
  osMatches?: OsMatch[];
  deviceType?: string;
  uptimeSeconds?: number;
  uptimeLastBoot?: string;
  tcpSequenceDifficulty?: number;
  tcpSequenceDescription?: string;
  tcpSequenceValues?: string;
  ipIdSequence?: string;
  tcpTsSequence?: string;
  networkDistance?: number;
  fingerprint?: string;
}

export interface TracerouteHop {
  hop: number;
  rttMs: number | null;
  /** nmap traceroute address */
  address: string;
  /** trace-route module legacy field */
  ip?: string;
  hostname?: string | null;
}

export interface ScanStats {
  startTime?: string;
  endTime?: string;
  elapsedSeconds?: number;
  hostsUp?: number;
  hostsTotal?: number;
  rawPacketsSent?: string;
  rawPacketsReceived?: string;
}

export interface HostStatus {
  up: boolean;
  latency?: number | null;
  method?: string | null;
}

export interface PortScanSummary {
  notShown?: string | null;
  closedCount?: number | null;
  filteredCount?: number | null;
  totalPortsScanned?: number | null;
}

export interface PortsResult {
  engine?: string;
  profile?: "quick" | "standard" | "deep";
  method?: string;
  durationMs?: number;
  startTime?: string;
  endTime?: string;
  behindProxy?: boolean;
  proxyProvider?: string | null;
  note?: string;
  detectedTechnologies?: string[];
  osFingerprint?: string | null;
  entries: PortResult[];
  hostStatus?: HostStatus;
  scanSummary?: PortScanSummary;
  osDetection?: OsDetection;
  traceroute?: TracerouteHop[];
  scanStats?: ScanStats;
}

export interface StatusResult {
  httpStatusCode: number | null;
  responseTimeMs: number | null;
  serverHeader: string | null;
  contentType: string | null;
  redirectCount: number | null;
}

export interface ScreenshotResult {
  imageUrl: string;
  viewport: string;
  capturedAt: string;
  /** Shown when imageUrl is empty (e.g. Chromium not found) */
  unavailableReason?: string | null;
}

export interface PageSourceResult {
  html: string;
  statusCode?: number | null;
  contentType: string;
  contentLength: number;
  truncated: boolean;
  /** Shown when html is empty (e.g. request blocked, timeout) */
  unavailableReason?: string | null;
}

export interface TechStackItem {
  name: string;
  category: string;
  version?: string;
  confidence: number;
}

/** Complete TLS analysis result. */
export interface TlsResult {
  grade?: string;
  score?: number;
  protocols: ProtocolInfo[];
  cipherSuites: CipherInfo[];
  cipherStats?: TlsCipherStats;
  cipherPreference?: "server" | "client";
  curves?: string[];
  preferredProtocol: string;
  sessionResumption: boolean | { id: boolean; ticket: boolean };
  config?: TlsConfig;
  handshakeSimulation?: HandshakeSimulationResult[];
}

export interface HstsResult {
  enabled: boolean;
  maxAge: number;
  includeSubDomains: boolean;
  preload: boolean;
  rawHeader: string;
}

export interface CookieItem {
  name: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "strict" | "lax" | "none";
  expires: string;
}

export interface CookiesResult {
  cookies: CookieItem[];
  issuesCount: number;
}

export interface FirewallResult {
  detected: boolean;
  provider: string | null;
  confidence: number;
  evidence: string;
}

export interface ThreatEntry {
  source: string;
  listed: boolean;
  detail: string;
}

export interface ThreatsResult {
  entries: ThreatEntry[];
  listedCount: number;
}

export interface RedirectHop {
  url: string;
  statusCode: number;
  responseTimeMs: number;
}

export interface RedirectsResult {
  hops: RedirectHop[];
  totalRedirects: number;
  finalUrl: string;
}

export interface MxRecord {
  priority: number;
  host: string;
}

export interface EmailConfigResult {
  mxRecords: MxRecord[];
  spf: { raw: string; status: "pass" | "fail" };
  dkim: { found: boolean; selector?: string };
  dmarc: { raw: string; policy: string; status: "pass" | "fail" };
}

export interface FeatureItem {
  name: string;
  detected: boolean;
  category: string;
}

export interface FeaturesResult {
  features: FeatureItem[];
  totalDetected?: number;
  source?: string;
  note?: string;
}

export interface RobotsTxtResult {
  exists: boolean;
  rawContent: string;
  allowedPaths: string[];
  disallowedPaths: string[];
  sitemapUrls: string[];
}

export interface SitemapResult {
  exists: boolean;
  url: string;
  urlCount: number;
  sampleUrls: string[];
}

export interface DnssecResult {
  enabled: boolean;
  valid: boolean;
  dsRecords: string[];
  dnskeyRecords: string[];
  algorithm: string;
  keyTag: number;
}

export interface SecurityTxtResult {
  exists: boolean;
  url: string;
  rawContent: string;
  contact: string | null;
  expires: string | null;
  encryption: string | null;
  acknowledgments: string | null;
  preferredLanguages: string | null;
  policy: string | null;
}

export interface TracerouteResult {
  hops: TracerouteHop[];
  totalHops: number;
  destinationReached: boolean;
}

export interface AssociatedHost {
  hostname: string;
  source: "reverse-dns" | "certificate" | "same-ip";
  ip?: string;
}

export interface AssociatedHostsResult {
  hosts: AssociatedHost[];
  totalFound: number;
  domain?: string;
}

export interface QualityCategory {
  id: string;
  title: string;
  score: number | null;
  displayScore: number;
}

export interface QualityAudit {
  id: string;
  title: string;
  displayValue: string;
  score: number | null;
  numericValue: number | null;
}

export interface QualityResult {
  categories: QualityCategory[];
  audits: QualityAudit[];
  fetchTime: string | null;
  requestedUrl: string;
  finalUrl: string;
  runtimeError: string | null;
}

export interface LinkedPage {
  url: string;
  text: string;
  type: "internal" | "external";
}

export interface LinkedPagesResult {
  internal: LinkedPage[];
  external: LinkedPage[];
  totalInternal: number;
  totalExternal: number;
}

export interface SocialTagsResult {
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogUrl: string | null;
  ogType: string | null;
  ogSiteName: string | null;
  twitterCard: string | null;
  twitterSite: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;
}

export interface ArchiveSnapshot {
  timestamp: string;
  url: string;
  statusCode: number;
}

export interface ArchivesResult {
  totalSnapshots: number;
  oldestSnapshot: string;
  newestSnapshot: string;
  snapshots: ArchiveSnapshot[];
}

export interface RankingResult {
  globalRank: number | null;
  countryRank: number | null;
  country: string | null;
  categoryRank: number | null;
  category: string | null;
}

export interface CarbonResult {
  isGreen: boolean;
  co2PerPageview: number;
  cleanerThanPercent: number;
  energyPerVisit: number;
}

export interface RankingAndCarbonResult {
  ranking: RankingResult;
  carbon: CarbonResult;
}

export interface ModuleErrorSummary {
  module: string;
  frontendKey: string | null;
  status: "failed" | "timeout";
  message: string;
}

export interface ModuleJob {
  module: string;
  status: "success" | "failed" | "timed-out" | "skipped";
  durationMs: number;
  error?: string;
}

export interface ModuleRetryResponse {
  module: string;
  status: "success" | "failed" | "timed-out";
  durationMs: number;
  error?: string;
  data?: Record<string, unknown>;
}

/** V2 derived security score breakdown (present only when API recomputed from raw modules). */
export interface SecurityScoreBreakdown {
  baseScore: number;
  confidence: number;
  severityCapApplied: "critical" | "high" | null;
  categoryScores: {
    transport: number;
    httpSecurity: number;
    threatIntel: number;
    infrastructure: number;
    bestPractices: number;
  };
}

export interface ScanDetail {
  id: string;
  domain: string;
  url: string;
  scannedAt: string | null;
  duration: string | null;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  securityScore: number | null;
  securityScoreBreakdown?: SecurityScoreBreakdown;
  severity: SeverityCounts;
  categorySummary: CategorySummary[];
  keyFindings: KeyFinding[];
  moduleErrors: Record<string, ModuleErrorSummary>;
  moduleJobs?: ModuleJob[];
  totalDurationMs?: number;
  ssl: SslResult;
  headers: HeadersResult;
  ip: IpInfoResult;
  whois: WhoisResult | null;
  dns: DnsResult;
  ports: PortsResult | null;
  statusCheck: StatusResult;
  screenshot: ScreenshotResult | null;
  pageSource?: PageSourceResult | null;
  techStack: TechStackItem[] | null;
  tls: TlsResult;
  hsts: HstsResult;
  cookies: CookiesResult;
  firewall: FirewallResult;
  threats: ThreatsResult;
  redirects: RedirectsResult | null;
  emailConfig: EmailConfigResult;
  features: FeaturesResult | null;
  robotsTxt: RobotsTxtResult;
  sitemap: SitemapResult;
  dnssec: DnssecResult;
  securityTxt: SecurityTxtResult;
  traceroute: TracerouteResult | null;
  associatedHosts: AssociatedHostsResult | null;
  linkedPages: LinkedPagesResult;
  socialTags: SocialTagsResult;
  archives: ArchivesResult;
  rankingAndCarbon: RankingAndCarbonResult;
  quality?: QualityResult | null;
}

export interface ScanResultCardData {
  score: number;
  duration: string;
  severity: SeverityCounts;
  reportHref: string;
}
