import { promises as dnsPromises } from 'dns';

import middleware from './_common/middleware.js';
import { extractHostname } from './_common/url.js';

// Probing arbitrary IPs for DoH was removed in favour of standard PTR/RDNS
// resolution: probing CDN edge IPs over HTTPS produced near-zero useful data
// and tripped IDS/abuse alarms in many corporate networks.
/**
 * Scan module: report PTR / RDNS info for the resolved IPs. The legacy DoH
 * probing was removed in P1-6 to avoid abusive outbound traffic to random
 * IPs.
 *
 * @param {string} rawUrl Normalised target URL.
 * @returns {Promise<object>} `{ ips, ptr, ... }`.
 */
const dnsHandler = async (rawUrl) => {
  try {
    const domain = extractHostname(rawUrl) || rawUrl;
    const addresses = await dnsPromises.resolve4(domain);
    const results = await Promise.all(addresses.map(async (address) => {
      const ptrRecords = await dnsPromises.reverse(address).catch(() => []);
      const hostname = Array.isArray(ptrRecords) && ptrRecords.length > 0 ? ptrRecords[0] : null;
      return {
        address,
        hostname,
        ptrRecords: Array.isArray(ptrRecords) ? ptrRecords : [],
      };
    }));

    return {
      domain,
      dns: results,
    };
  } catch (error) {
    throw new Error(`An error occurred while resolving DNS. ${error.message}`, { cause: error });
  }
};


export const handler = middleware(dnsHandler);
export default handler;
