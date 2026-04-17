/**
 * Shared over-long fixture strings used to lock in card-content wrapping
 * behaviour across scan detail components. These mirror real-world payloads
 * that previously caused horizontal overflow on narrow viewports.
 *
 * See `prompt_dev/middleReport.md` §6 for the wrapping spec these fixtures
 * exercise.
 */

export const LONG_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://api.example.com wss://realtime.example.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests; report-uri https://example.com/csp-report";

export const LONG_SET_COOKIE =
  "session_id=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ; Domain=.example.com; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT; HttpOnly; Secure; SameSite=Lax";

export const LONG_URL =
  "https://example.com/path/to/some/deeply/nested/resource?utm_source=newsletter&utm_medium=email&utm_campaign=2026-spring&token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

export const LONG_DMARC_RAW =
  "v=DMARC1; p=reject; sp=reject; rua=mailto:dmarc-reports@example.com,mailto:dmarc-aggregate@partner.example.com; ruf=mailto:dmarc-forensics@example.com; fo=1; adkim=s; aspf=s; pct=100; ri=86400";

export const LONG_SPF_RAW =
  "v=spf1 ip4:192.0.2.0/24 ip4:198.51.100.0/24 ip6:2001:db8::/32 include:_spf.example.com include:_spf.partner.example.com include:mailgun.org include:sendgrid.net include:_spf.google.com -all";

export const LONG_TXT_RECORD =
  "google-site-verification=abcdef0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789";
