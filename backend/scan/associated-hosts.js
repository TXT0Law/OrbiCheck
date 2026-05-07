import dns from 'dns/promises';
import tls from 'tls';

import middleware from './_common/middleware.js';

const TLS_TIMEOUT_MS = 10000;

/**
 * Discover hosts associated with the target domain via:
 * 1. SSL Certificate SAN (Subject Alternative Names)
 * 2. Reverse DNS (PTR records)
 * 3. Same-IP detection (resolve SAN domains, check if same IP)
 */
async function associatedHostsHandler(url) {
  const startTime = Date.now();

  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;

    const addresses = await dns.resolve4(hostname);
    const targetIp = addresses[0];

    const [certHosts, reverseDnsHosts] = await Promise.allSettled([
      getCertificateHosts(hostname),
      getReverseDnsHosts(targetIp),
    ]);

    const certResults = certHosts.status === 'fulfilled' ? certHosts.value : [];
    const rdnsResults = reverseDnsHosts.status === 'fulfilled' ? reverseDnsHosts.value : [];

    const sameIpHosts = await findSameIpHosts(certResults, targetIp, hostname);

    const allHosts = deduplicateHosts(
      [...certResults, ...rdnsResults, ...sameIpHosts],
      hostname
    );

    return {
      success: true,
      data: {
        domain: hostname,
        hosts: allHosts,
        totalFound: allHosts.length,
      },
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      data: { domain: '', hosts: [], totalFound: 0 },
      error: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime,
    };
  }
}

function getCertificateHosts(hostname) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: hostname,
        port: 443,
        servername: hostname,
        timeout: TLS_TIMEOUT_MS,
      },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          socket.destroy();

          if (!cert || !cert.subjectaltname) {
            resolve([]);
            return;
          }

          const hosts = cert.subjectaltname
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.startsWith('DNS:'))
            .map((s) => s.slice(4))
            .filter((s) => !s.startsWith('*'))
            .map((h) => ({ hostname: h, source: 'certificate' }));

          resolve(hosts);
        } catch (err) {
          socket.destroy();
          reject(err);
        }
      }
    );

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });

    socket.setTimeout(TLS_TIMEOUT_MS, () => {
      socket.destroy();
      reject(new Error('TLS connection timed out'));
    });
  });
}

async function getReverseDnsHosts(ip) {
  try {
    const hostnames = await dns.reverse(ip);
    return hostnames.map((h) => ({
      hostname: h,
      source: 'reverse-dns',
      ip,
    }));
  } catch {
    return [];
  }
}

async function findSameIpHosts(certHosts, targetIp, originalHostname) {
  const sameIp = [];
  const checked = new Set([originalHostname]);
  const MAX_LOOKUPS = 20;
  const toCheck = certHosts
    .filter((h) => !checked.has(h.hostname))
    .slice(0, MAX_LOOKUPS);

  const results = await Promise.allSettled(
    toCheck.map(async (host) => {
      checked.add(host.hostname);
      try {
        const addrs = await dns.resolve4(host.hostname);
        if (addrs.includes(targetIp)) {
          return { hostname: host.hostname, source: 'same-ip', ip: targetIp };
        }
      } catch {
        // DNS resolution failure — skip
      }
      return null;
    })
  );

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      sameIp.push(r.value);
    }
  }

  return sameIp;
}

function deduplicateHosts(hosts, originalHostname) {
  const seen = new Set();
  const unique = [];

  for (const host of hosts) {
    const key = host.hostname.toLowerCase();
    if (key === originalHostname.toLowerCase()) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(host);
  }

  return unique;
}

export const handler = middleware(associatedHostsHandler);
export default handler;
