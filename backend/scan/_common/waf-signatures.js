// Declarative WAF/CDN signatures for firewall.js. Each entry is checked
// against either a successful response or an error response; if it matches,
// firewall.js reports `{ hasWaf: true, waf: <label>, evidence }`.
//
// Each signature must define:
//   - label   : human-readable WAF/CDN name
//   - when    : (headers, statusCode, body?) => string|null
//               Return a non-empty evidence string when matched, otherwise null.

function headerIncludes(headers, name, needle) {
  if (!headers) return false;
  const value = headers[name];
  if (typeof value !== 'string') return false;
  return value.toLowerCase().includes(needle.toLowerCase());
}

function headerExists(headers, name) {
  return Boolean(headers && headers[name]);
}

export const WAF_SIGNATURES = [
  {
    label: 'Cloudflare',
    when: (headers) => {
      if (headerIncludes(headers, 'server', 'cloudflare')) return 'server: cloudflare';
      if (headerExists(headers, 'cf-ray')) return 'cf-ray header present';
      return null;
    },
  },
  {
    label: 'AWS WAF',
    when: (headers) =>
      headerIncludes(headers, 'x-powered-by', 'AWS Lambda') ? 'x-powered-by: AWS Lambda' : null,
  },
  {
    label: 'Akamai',
    when: (headers) =>
      headerIncludes(headers, 'server', 'AkamaiGHost') ? 'server: AkamaiGHost' : null,
  },
  {
    label: 'Sucuri',
    when: (headers) =>
      headerIncludes(headers, 'server', 'Sucuri') ? 'server: Sucuri' : null,
  },
  {
    label: 'Sucuri CloudProxy WAF',
    when: (headers) => {
      if (headerExists(headers, 'x-sucuri-id')) return 'x-sucuri-id header';
      if (headerExists(headers, 'x-sucuri-cache')) return 'x-sucuri-cache header';
      return null;
    },
  },
  {
    label: 'Barracuda WAF',
    when: (headers) =>
      headerIncludes(headers, 'server', 'BarracudaWAF') ? 'server: BarracudaWAF' : null,
  },
  {
    label: 'F5 BIG-IP',
    when: (headers) => {
      if (headerIncludes(headers, 'server', 'BIG-IP')) return 'server: BIG-IP';
      if (headerIncludes(headers, 'server', 'F5 BIG-IP')) return 'server: F5 BIG-IP';
      return null;
    },
  },
  {
    label: 'Fortinet FortiWeb WAF',
    when: (headers) =>
      headerIncludes(headers, 'server', 'FortiWeb') ? 'server: FortiWeb' : null,
  },
  {
    label: 'Imperva SecureSphere WAF',
    when: (headers) =>
      headerIncludes(headers, 'server', 'Imperva') ? 'server: Imperva' : null,
  },
  {
    label: 'Sqreen',
    when: (headers) =>
      headerIncludes(headers, 'x-protected-by', 'Sqreen') ? 'x-protected-by: Sqreen' : null,
  },
  {
    label: 'Reblaze WAF',
    when: (headers) =>
      headerExists(headers, 'x-waf-event-info') ? 'x-waf-event-info header' : null,
  },
  {
    label: 'Citrix NetScaler',
    when: (headers) => {
      const setCookie = headers && headers['set-cookie'];
      const arr = Array.isArray(setCookie) ? setCookie.join(';') : setCookie;
      if (typeof arr === 'string' && arr.includes('_citrix_ns_id')) {
        return 'set-cookie includes _citrix_ns_id';
      }
      return null;
    },
  },
  {
    label: 'WangZhanBao WAF',
    when: (headers) => {
      if (headerExists(headers, 'x-denied-reason')) return 'x-denied-reason header';
      if (headerExists(headers, 'x-wzws-requested-method')) return 'x-wzws-requested-method header';
      return null;
    },
  },
  {
    label: 'Webcoment Firewall',
    when: (headers) =>
      headerExists(headers, 'x-webcoment') ? 'x-webcoment header' : null,
  },
  {
    label: 'Yundun WAF',
    when: (headers) => {
      if (headerIncludes(headers, 'server', 'Yundun')) return 'server: Yundun';
      if (headerExists(headers, 'x-yd-waf-info')) return 'x-yd-waf-info header';
      if (headerExists(headers, 'x-yd-info')) return 'x-yd-info header';
      return null;
    },
  },
  {
    label: 'Safe3 Web Application Firewall',
    when: (headers) =>
      headerIncludes(headers, 'server', 'Safe3WAF') ? 'server: Safe3WAF' : null,
  },
  {
    label: 'NAXSI WAF',
    when: (headers) =>
      headerIncludes(headers, 'server', 'NAXSI') ? 'server: NAXSI' : null,
  },
  {
    label: 'IBM WebSphere DataPower',
    when: (headers) =>
      headerExists(headers, 'x-datapower-transactionid')
        ? 'x-datapower-transactionid header'
        : null,
  },
  {
    label: 'QRATOR WAF',
    when: (headers) =>
      headerIncludes(headers, 'server', 'QRATOR') ? 'server: QRATOR' : null,
  },
  {
    label: 'DDoS-Guard WAF',
    when: (headers) =>
      headerIncludes(headers, 'server', 'ddos-guard') ? 'server: ddos-guard' : null,
  },
];

// HTTP status codes commonly returned when a WAF actively blocks the request.
export const WAF_BLOCK_STATUSES = new Set([401, 403, 406, 429, 503]);

// Network-level error codes that typically indicate a WAF closing the
// connection (e.g. Imperva, Akamai bot defence).
export const WAF_BLOCK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNABORTED',
  'EPROTO',
]);

export function findMatchingSignature(headers, statusCode = null, body = null) {
  for (const signature of WAF_SIGNATURES) {
    const evidence = signature.when(headers || {}, statusCode, body);
    if (evidence) {
      return { label: signature.label, evidence };
    }
  }
  return null;
}
