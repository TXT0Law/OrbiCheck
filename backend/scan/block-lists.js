import dns from 'dns';
import { URL } from 'url';

import middleware from './_common/middleware.js';

const DNS_SERVERS = [
  { name: 'AdGuard', ip: '176.103.130.130' },
  { name: 'AdGuard Family', ip: '176.103.130.132' },
  { name: 'CleanBrowsing Adult', ip: '185.228.168.10' },
  { name: 'CleanBrowsing Family', ip: '185.228.168.168' },
  { name: 'CleanBrowsing Security', ip: '185.228.168.9' },
  { name: 'CloudFlare', ip: '1.1.1.1' },
  { name: 'CloudFlare Family', ip: '1.1.1.3' },
  { name: 'Comodo Secure', ip: '8.26.56.26' },
  { name: 'Google DNS', ip: '8.8.8.8' },
  { name: 'Neustar Family', ip: '156.154.70.3' },
  { name: 'Neustar Protection', ip: '156.154.70.2' },
  { name: 'Norton Family', ip: '199.85.126.20' },
  { name: 'OpenDNS', ip: '208.67.222.222' },
  { name: 'OpenDNS Family', ip: '208.67.222.123' },
  { name: 'Quad9', ip: '9.9.9.9' },
  { name: 'Yandex Family', ip: '77.88.8.7' },
  { name: 'Yandex Safe', ip: '77.88.8.88' },
];

const knownBlockIPs = [
  '146.112.61.106', // OpenDNS
  '185.228.168.10', // CleanBrowsing
  '8.26.56.26',     // Comodo
  '9.9.9.9',        // Quad9
  '208.69.38.170',  // Some OpenDNS IPs
  '208.69.39.170',  // Some OpenDNS IPs
  '208.67.222.222', // OpenDNS
  '208.67.222.123', // OpenDNS FamilyShield
  '199.85.126.10',  // Norton
  '199.85.126.20',  // Norton Family
  '156.154.70.22',  // Neustar
  '77.88.8.7',      // Yandex
  '77.88.8.8',      // Yandex
  '::1',
  '2a02:6b8::feed:0ff', // Yandex DNS
  '2a02:6b8::feed:bad', // Yandex Safe
  '2a02:6b8::feed:a11', // Yandex Family
  '2620:119:35::35',    // OpenDNS
  '2620:119:53::53',    // OpenDNS FamilyShield
  '2606:4700:4700::1111', // Cloudflare
  '2606:4700:4700::1001', // Cloudflare
  '2001:4860:4860::8888', // Google DNS
  '2a0d:2a00:1::',        // AdGuard
  '2a0d:2a00:2::',        // AdGuard Family
];

// State values for a single resolver outcome:
// - 'blocked' : resolver explicitly returned a sinkhole IP, or refused via SERVFAIL
// - 'clear'   : resolver returned at least one address, none of which are sinkholes
// - 'unknown' : domain has no record on this resolver (NXDOMAIN/ENOTFOUND/ENODATA)
const STATE_BLOCKED = 'blocked';
const STATE_CLEAR = 'clear';
const STATE_UNKNOWN = 'unknown';

function resolveAddresses(domain, serverIP, resolveFn) {
  return new Promise((resolve) => {
    resolveFn(domain, { server: serverIP }, (err, addresses) => {
      if (!err) {
        resolve({ ok: true, addresses: addresses || [] });
        return;
      }
      resolve({ ok: false, code: err.code });
    });
  });
}

const isSinkhole = (addresses) => addresses.some((addr) => knownBlockIPs.includes(addr));

const SERVFAIL_LIKE = new Set(['SERVFAIL', 'EREFUSED', 'TIMEOUT']);
const NXDOMAIN_LIKE = new Set(['ENOTFOUND', 'ENODATA', 'NOTFOUND', 'NODATA']);

function classifyError(code) {
  if (SERVFAIL_LIKE.has(String(code).toUpperCase())) return STATE_BLOCKED;
  if (NXDOMAIN_LIKE.has(String(code).toUpperCase())) return STATE_UNKNOWN;
  return STATE_UNKNOWN;
}

const checkAgainstResolver = async (domain, serverIP) => {
  const aResult = await resolveAddresses(domain, serverIP, dns.resolve4);
  if (aResult.ok) {
    return isSinkhole(aResult.addresses) ? STATE_BLOCKED : STATE_CLEAR;
  }

  const aClassification = classifyError(aResult.code);

  // Only fall back to AAAA when A failed for "no record" reasons; a SERVFAIL
  // on the A query already tells us the resolver refused this name.
  if (aClassification === STATE_BLOCKED) {
    return STATE_BLOCKED;
  }

  const aaaaResult = await resolveAddresses(domain, serverIP, dns.resolve6);
  if (aaaaResult.ok) {
    return isSinkhole(aaaaResult.addresses) ? STATE_BLOCKED : STATE_CLEAR;
  }

  return classifyError(aaaaResult.code);
};

const checkDomainAgainstDnsServers = async (domain) => {
  const settled = await Promise.allSettled(
    DNS_SERVERS.map(async (server) => {
      const state = await checkAgainstResolver(domain, server.ip);
      return {
        server: server.name,
        serverIp: server.ip,
        state,
        isBlocked: state === STATE_BLOCKED,
      };
    }),
  );

  return settled.map((entry, index) => {
    if (entry.status === 'fulfilled') {
      return entry.value;
    }
    const fallbackServer = DNS_SERVERS[index];
    return {
      server: fallbackServer.name,
      serverIp: fallbackServer.ip,
      state: STATE_UNKNOWN,
      isBlocked: false,
      error: entry.reason?.message,
    };
  });
};

export const blockListHandler = async (url) => {
  const domain = new URL(url).hostname;
  const results = await checkDomainAgainstDnsServers(domain);
  return { blocklists: results };
};

export const handler = middleware(blockListHandler);
export default handler;
