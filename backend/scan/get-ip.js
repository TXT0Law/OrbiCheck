import dns from 'dns';

import { enrichIpWithFallbacks } from './_common/ip-enrichment.js';
import middleware from './_common/middleware.js';

const lookupAsync = (address) => {
  return new Promise((resolve, reject) => {
    dns.lookup(address, (err, ip, family) => {
      if (err) {
        reject(err);
      } else {
        resolve({ ip, family });
      }
    });
  });
};

const extractLookupHost = (url) => {
  const normalized = url.trim();
  const withProtocol = /^https?:\/\//i.test(normalized)
    ? normalized
    : `https://${normalized}`;

  try {
    const parsed = new URL(withProtocol);
    return parsed.hostname;
  } catch {
    return normalized
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .split(':')[0];
  }
};

/**
 * Scan module: resolve the IPv4 / IPv6 address for the target hostname
 * and enrich it via `_common/ip-enrichment.js` (geo, ASN, ISP).
 *
 * @param {string} url Normalised target URL.
 * @returns {Promise<{ip?: string, ipv6?: string, geo?: object, asn?: object,
 *   error?: string}>}
 */
const ipHandler = async (url) => {
  const address = extractLookupHost(url);
  const { ip } = await lookupAsync(address);

  if (!ip) {
    return { ip: '', error: 'Could not resolve host' };
  }

  const enriched = await enrichIpWithFallbacks(ip);
  return {
    ip: enriched.ip || ip,
    address: enriched.ip || ip,
    asn: enriched.asn || '',
    isp: enriched.isp || '',
    org: enriched.org || '',
    country: enriched.country || '',
    countryCode: enriched.countryCode || '',
    city: enriched.city || '',
    region: enriched.region || '',
    lat: enriched.lat,
    lon: enriched.lon,
    hostingProvider: enriched.hostingProvider || '',
    isHosting: enriched.isHosting ?? false,
  };
};

export const handler = middleware(ipHandler);
export default handler;
