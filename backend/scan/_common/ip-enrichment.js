/**
 * IP geolocation with multiple providers (ip-api → ipwho.is → optional ipinfo.io).
 */

import https from 'https';

export const LOOKUP_TIMEOUT_MS = 6000;

const IP_API_FIELDS =
  'status,country,countryCode,region,regionName,city,lat,lon,isp,org,as,hosting,query';

const httpsJson = (url, timeoutMs = LOOKUP_TIMEOUT_MS) => {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
};

const emptyShell = (ip) => ({
  ip,
  asn: '',
  isp: '',
  org: '',
  country: '',
  countryCode: '',
  region: '',
  city: '',
  lat: undefined,
  lon: undefined,
  hostingProvider: '',
  isHosting: false,
});

/**
 * Merge secondary into primary; non-empty primary wins.
 * @param {Record<string, unknown>} primary
 * @param {Record<string, unknown>} secondary
 */
export function mergeIpEnrichment(primary, secondary) {
  const pickStr = (a, b) => {
    const sa = a != null && String(a).trim() ? String(a).trim() : '';
    const sb = b != null && String(b).trim() ? String(b).trim() : '';
    return sa || sb;
  };
  const p = primary || {};
  const s = secondary || {};
  return {
    ip: pickStr(p.ip, s.ip),
    asn: pickStr(p.asn, s.asn),
    isp: pickStr(p.isp, s.isp),
    org: pickStr(p.org, s.org),
    country: pickStr(p.country, s.country),
    countryCode: pickStr(p.countryCode, s.countryCode),
    region: pickStr(p.region, s.region),
    city: pickStr(p.city, s.city),
    lat: p.lat ?? s.lat,
    lon: p.lon ?? s.lon,
    hostingProvider: pickStr(p.hostingProvider, s.hostingProvider),
    isHosting: Boolean(p.isHosting || s.isHosting),
  };
}

export function isEnrichmentSparse(row) {
  if (!row || typeof row !== 'object') return true;
  const has =
    row.country ||
    row.isp ||
    row.city ||
    (row.asn != null && String(row.asn).trim() !== '');
  return !has;
}

export async function enrichFromIpApi(ip) {
  const url = `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=${IP_API_FIELDS}`;
  const parsed = await httpsJson(url);
  if (!parsed || parsed.status !== 'success') {
    return emptyShell(ip);
  }
  return {
    ip: parsed.query || ip,
    asn: parsed.as ? String(parsed.as).replace(/^AS/i, '') : '',
    isp: parsed.isp || '',
    org: parsed.org || '',
    country: parsed.country || '',
    countryCode: parsed.countryCode || '',
    region: parsed.regionName || parsed.region || '',
    city: parsed.city || '',
    lat: parsed.lat,
    lon: parsed.lon,
    hostingProvider: parsed.hosting ? 'yes' : '',
    isHosting: !!parsed.hosting,
  };
}

/** https://ipwho.is/docs — free, no API key */
export async function enrichFromIpWhois(ip) {
  const url = `https://ipwho.is/${encodeURIComponent(ip)}`;
  const parsed = await httpsJson(url);
  if (!parsed || parsed.success !== true) {
    return emptyShell(ip);
  }
  const conn = parsed.connection && typeof parsed.connection === 'object' ? parsed.connection : {};
  let asn = '';
  if (conn.asn != null) {
    asn = String(conn.asn).replace(/^AS/i, '');
  }
  return {
    ip: parsed.ip || ip,
    asn,
    isp: conn.isp || '',
    org: conn.org || '',
    country: parsed.country || '',
    countryCode: parsed.country_code || '',
    region: parsed.region || '',
    city: parsed.city || '',
    lat: typeof parsed.latitude === 'number' ? parsed.latitude : undefined,
    lon: typeof parsed.longitude === 'number' ? parsed.longitude : undefined,
    hostingProvider: '',
    isHosting: false,
  };
}

/** https://ipinfo.io — requires IPINFO_TOKEN for full quota */
export async function enrichFromIpInfo(ip, token) {
  if (!token) {
    return emptyShell(ip);
  }
  const url = `https://ipinfo.io/${encodeURIComponent(ip)}?token=${encodeURIComponent(token)}`;
  const parsed = await httpsJson(url);
  if (!parsed || parsed.error) {
    return emptyShell(ip);
  }
  let asn = '';
  const org = parsed.org || '';
  const m = /^AS(\d+)\s+/i.exec(org);
  if (m) {
    asn = m[1];
  }
  return {
    ip: parsed.ip || ip,
    asn,
    isp: org || '',
    org: org || '',
    country: parsed.country || '',
    countryCode: parsed.country || '',
    region: parsed.region || '',
    city: parsed.city || '',
    lat: undefined,
    lon: undefined,
    hostingProvider: '',
    isHosting: false,
  };
}

export async function enrichIpWithFallbacks(ip) {
  const shell = emptyShell(ip);
  let acc = await enrichFromIpApi(ip);
  acc = mergeIpEnrichment(acc, shell);

  if (isEnrichmentSparse(acc)) {
    const w = await enrichFromIpWhois(ip);
    acc = mergeIpEnrichment(acc, w);
  }

  if (isEnrichmentSparse(acc)) {
    const token = process.env.IPINFO_TOKEN?.trim();
    if (token) {
      const info = await enrichFromIpInfo(ip, token);
      acc = mergeIpEnrichment(acc, info);
    }
  }

  return acc;
}
