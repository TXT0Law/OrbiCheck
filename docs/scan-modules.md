# Scan Modules Reference

The Scan Service (`backend/scan/`) contains 30+ OSINT modules. Each module is a standalone `.js` file that accepts a URL and returns structured data about the target.

## Module Result Format

### Single module HTTP response

When a single module is called via `GET /api/scan/:module?url=TARGET`, the response body is whatever the module's middleware returns (typically the module-specific data object directly).

### Batch response

When modules are executed via `POST /api/scan/batch`, the response wraps per-module results in a summary envelope:

```json
{
  "url": "https://example.com",
  "totalModules": 3,
  "successCount": 2,
  "failedCount": 1,
  "results": {
    "ssl": {
      "success": true,
      "statusCode": 200,
      "data": { },
      "durationMs": 1234
    },
    "dns": {
      "success": true,
      "statusCode": 200,
      "data": { },
      "durationMs": 567
    },
    "ports": {
      "success": false,
      "statusCode": 408,
      "data": { "error": "Module timed out", "timedOut": true },
      "durationMs": 30000
    }
  }
}
```

Each entry in `results` uses the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | `true` when the HTTP status code is 2xx/3xx |
| `statusCode` | number | HTTP-style status code from the module handler |
| `data` | object | Module-specific result payload (structure varies per module) |
| `durationMs` | number | Execution time in milliseconds |

## Scan Service API

The Scan Service runs on port 4000 and is called internally by the backend. It is not exposed to end users directly.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health + loaded module count |
| GET | `/api/scan/modules` | List all available module names |
| GET | `/api/scan/:module?url=TARGET` | Run a single module |
| POST | `/api/scan/batch` | Run multiple modules in parallel |

### POST /api/scan/batch

```json
{
  "url": "https://example.com",
  "modules": ["ssl", "dns", "headers"]
}
```

If `modules` is omitted, all registered modules are executed.

---

## Module Catalog

### Network

| Module | File | Description |
|--------|------|-------------|
| `get-ip` | `get-ip.js` | IP address geolocation with multi-provider fallback (ip-api.com, ipwho.is, ipinfo.io) |
| `dns` | `dns.js` | DNS records — A, AAAA, CNAME, MX, NS, SOA |
| `dns-server` | `dns-server.js` | Authoritative DNS server information |
| `txt-records` | `txt-records.js` | TXT record analysis (SPF, DKIM selectors, verification tokens) |
| `whois` | `whois.js` | WHOIS domain registration data (registrar, dates, nameservers) |
| `trace-route` | `trace-route.js` | Network path traceroute to the target |
| `ports` | `ports.js` | Common open port scanning |
| `associated-hosts` | `associated-hosts.js` | Discover related hostnames sharing the same IP |

### SSL / TLS

| Module | File | Description |
|--------|------|-------------|
| `ssl` | `ssl.js` | SSL certificate chain analysis (issuer, validity, SANs, chain depth) |
| `tls` | `tls.js` | TLS configuration — supported protocol versions and cipher suites |

### Security

| Module | File | Description |
|--------|------|-------------|
| `http-security` | `http-security.js` | HTTP security features audit (CSP, X-Frame-Options, etc.) |
| `hsts` | `hsts.js` | HSTS header configuration and preload status |
| `dnssec` | `dnssec.js` | DNSSEC validation chain verification |
| `firewall` | `firewall.js` | WAF / firewall detection (Cloudflare, AWS WAF, etc.) |
| `security-txt` | `security-txt.js` | security.txt file presence and content (RFC 9116) |

### Content Analysis

| Module | File | Description |
|--------|------|-------------|
| `headers` | `headers.js` | Full HTTP response headers |
| `cookies` | `cookies.js` | Cookie analysis — names, flags (Secure, HttpOnly, SameSite), expiry |
| `robots-txt` | `robots-txt.js` | robots.txt parsing — allowed/disallowed paths, sitemap references |
| `sitemap` | `sitemap.js` | Sitemap.xml discovery and URL count |
| `linked-pages` | `linked-pages.js` | Internal and external link discovery from page content |
| `page-source` | `page-source.js` | Raw page source code retrieval |

### Threat Intelligence

| Module | File | Description |
|--------|------|-------------|
| `threats` | `threats.js` | Malware and phishing detection via threat intelligence feeds |
| `block-lists` | `block-lists.js` | Domain/IP blocklist lookups across multiple databases |

### Server Information

| Module | File | Description |
|--------|------|-------------|
| `status` | `status.js` | HTTP status code and response metadata |
| `redirects` | `redirects.js` | Full redirect chain tracing (301, 302, meta refresh) |

### Site Profile

| Module | File | Description |
|--------|------|-------------|
| `tech-stack` | `tech-stack.js` | Technology stack detection via Wappalyzer with HTTP header fingerprint fallback |
| `social-tags` | `social-tags.js` | Open Graph, Twitter Cards, and other social media meta tags |
| `quality` | `quality.js` | Page quality metrics |
| `screenshot` | `screenshot.js` | Full-page screenshot via Playwright Chromium |
| `features` | `features.js` | Website feature detection (via BuiltWith API if key provided) |
| `carbon` | `carbon.js` | Estimated carbon footprint per page load |
| `archives` | `archives.js` | Wayback Machine historical snapshots |
| `mail-config` | `mail-config.js` | Email authentication config — SPF, DKIM, DMARC records |
| `rank` | `rank.js` | Global traffic ranking |
| `legacy-rank` | `legacy-rank.js` | Legacy ranking implementation |

## Extended Timeout Modules

The following modules receive an extended timeout budget during batch execution due to their heavier workload:

- `whois`
- `screenshot`
- `tech-stack`
- `ports`
- `trace-route`
- `tls`
- `cookies`

Configure via `EXTENDED_MODULE_TIMEOUT_MS` (default: 60000ms).

## Adding a New Module

1. Create a new `.js` file in `backend/scan/` (flat layout, no subdirectories).

2. Write an async handler that accepts a `url` string and returns a result object. Wrap it with the shared middleware from `_common/middleware.js`:

```javascript
// my-module.js
import middleware from './_common/middleware.js';

const myModuleHandler = async (url) => {
  // Your logic here — url is already normalized by the middleware
  return {
    // Module-specific data (will be sent as the JSON response body)
  };
};

export const handler = middleware(myModuleHandler);
export default handler;
```

The middleware handles URL normalization, timeout racing, and error formatting. At runtime, `registry.js` calls the exported `handler` (or `default`) as an Express-compatible `(req, res)` function — the middleware bridges the two signatures.

3. The module is **automatically registered** by `registry.js` on startup. Any `.js` file at the root of `backend/scan/` that is not in the exclusion list and exports a callable `handler` or `default` will be loaded. No manual registration step is needed.

4. Add a test file in `backend/scan/__tests__/my-module.test.js`.

5. The module key will be the filename without `.js` (e.g., `my-module`).

### Naming Conventions

- File names use `kebab-case.js`
- Module keys match the filename (minus extension)
- Internal/helper files should be placed in `_common/` or prefixed with `_` to be excluded from auto-registration
