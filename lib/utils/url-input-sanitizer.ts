/**
 * URL input parsing, validation, and security sanitization.
 * Used by ScanInput for batch URL submission.
 */

// ─── Constants ───────────────────────────────────────────────────────

const MAX_TOTAL_INPUT_LENGTH = 4096;
const MAX_SINGLE_URL_LENGTH = 2048;
const MAX_URL_COUNT = 10;
const ALLOWED_PROTOCOLS = ["http:", "https:"];

const XSS_PATTERNS: RegExp[] = [
  /<script\b/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /vbscript:/i,
  /data:\s*text\/html/i,
  /&#\d+;/,
  /&#x[\da-f]+;/i,
  /expression\s*\(/i,
  /url\s*\(/i,
];

const DANGEROUS_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

const SQL_INJECTION_PATTERNS: RegExp[] = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC)\b)/i,
  /(['"];\s*--)/,
  /(\/\*.*\*\/)/,
  /(\bOR\b\s+\d+\s*=\s*\d+)/i,
];

// ─── Types ───────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface ParseResult {
  urls: string[];
  count: number;
  errors: string[];
}

// ─── Public Functions ────────────────────────────────────────────────

/**
 * Parse raw input text into individual URLs.
 * Supports comma-separated, newline-separated, or mixed.
 */
export function parseUrls(raw: string): string[] {
  if (!raw || typeof raw !== "string") return [];

  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s.length > 0);
}

/**
 * Validate the entire raw input string for security issues.
 * Call this BEFORE parsing individual URLs.
 */
export function validateUrlInput(input: string): ValidationResult {
  if (!input || typeof input !== "string") {
    return { valid: false, error: "Input is empty" };
  }

  if (input.length > MAX_TOTAL_INPUT_LENGTH) {
    return {
      valid: false,
      error: `Input too long (max ${MAX_TOTAL_INPUT_LENGTH} characters)`,
    };
  }

  if (DANGEROUS_CHARS.test(input)) {
    return { valid: false, error: "Input contains invalid control characters" };
  }

  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(input)) {
      return { valid: false, error: "Potentially unsafe input detected" };
    }
  }

  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      return { valid: false, error: "Potentially unsafe input detected" };
    }
  }

  return { valid: true };
}

/**
 * Validate a single URL for format and security.
 */
export function validateSingleUrl(url: string): ValidationResult {
  if (url.length > MAX_SINGLE_URL_LENGTH) {
    return {
      valid: false,
      error: `URL too long (max ${MAX_SINGLE_URL_LENGTH} characters)`,
    };
  }

  let parsed: URL;
  try {
    const urlWithProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    parsed = new URL(urlWithProtocol);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return {
      valid: false,
      error: `Only HTTP and HTTPS protocols are allowed (got ${parsed.protocol})`,
    };
  }

  if (!parsed.hostname || parsed.hostname.length === 0) {
    return { valid: false, error: "URL must have a valid hostname" };
  }

  if (isPrivateHost(parsed.hostname)) {
    return { valid: false, error: "Cannot scan private/internal addresses" };
  }

  if (!parsed.hostname.includes(".")) {
    return { valid: false, error: "URL must have a valid domain name" };
  }

  return { valid: true };
}

/**
 * Full parse + validate pipeline.
 * Returns validated URLs and any errors encountered.
 * @param raw - Raw input string (newline or comma separated)
 * @param maxUrls - Optional max URL count (default: MAX_URL_COUNT)
 */
export function parseAndValidateUrls(
  raw: string,
  maxUrls: number = MAX_URL_COUNT
): ParseResult {
  const errors: string[] = [];

  const inputCheck = validateUrlInput(raw);
  if (!inputCheck.valid) {
    return { urls: [], count: 0, errors: [inputCheck.error!] };
  }

  const rawUrls = parseUrls(raw);

  if (rawUrls.length === 0) {
    return { urls: [], count: 0, errors: ["No URLs found in input"] };
  }

  if (rawUrls.length > maxUrls) {
    return {
      urls: [],
      count: rawUrls.length,
      errors: [`Too many URLs (max ${maxUrls}, got ${rawUrls.length})`],
    };
  }

  const validUrls: string[] = [];
  for (const url of rawUrls) {
    const check = validateSingleUrl(url);
    if (check.valid) {
      const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      validUrls.push(normalized);
    } else {
      errors.push(`"${url}": ${check.error}`);
    }
  }

  return {
    urls: validUrls,
    count: rawUrls.length,
    errors,
  };
}

// ─── Internal Helpers ────────────────────────────────────────────────

function isPrivateHost(hostname: string): boolean {
  const privatePatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^0\.0\.0\.0$/,
    /^::1$/,
    /^fc00:/i,
    /^fe80:/i,
    /^fd/i,
    /\.local$/i,
    /\.internal$/i,
    /\.localhost$/i,
  ];
  return privatePatterns.some((p) => p.test(hostname));
}
