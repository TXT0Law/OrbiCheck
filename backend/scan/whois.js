import net from 'net';
import psl from 'psl';

import { logger } from './_common/logger.js';
import middleware from './_common/middleware.js';

const WHOIS_TIMEOUT_MS = parseInt(process.env.WHOIS_TIMEOUT_MS || '15000', 10);
const WHOIS_RATE_LIMIT_RETRY_DELAY_MS = parseInt(
  process.env.WHOIS_RATE_LIMIT_RETRY_DELAY_MS || '12000',
  10,
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const WHOIS_CACHE_TTL_MS = parseInt(process.env.WHOIS_CACHE_TTL_MS || '86400000', 10); // 24h default
const WHOIS_CACHE_MAX = parseInt(process.env.WHOIS_CACHE_MAX || '500', 10);

/** In-memory cache: domain -> { data, expiresAt } */
const cache = new Map();

function getCached(domain) {
  const entry = cache.get(domain.toLowerCase());
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.data;
}

function setCache(domain, data) {
  const key = domain.toLowerCase();
  if (cache.size >= WHOIS_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, expiresAt: Date.now() + WHOIS_CACHE_TTL_MS });
}

function getBaseDomain(url) {
  let protocol = '';
  if (url.startsWith('http://')) {
    protocol = 'http://';
  } else if (url.startsWith('https://')) {
    protocol = 'https://';
  }
  const noProtocolUrl = url.replace(protocol, '');
  const parsed = psl.parse(noProtocolUrl);
  return protocol + (parsed.domain ?? '');
}

function extractDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;

  const multiPartTlds = [
    'co.uk', 'com.au', 'co.jp', 'co.kr', 'com.br', 'co.in',
    'org.uk', 'ac.uk',
    // .hk second-level domains
    'gov.hk', 'com.hk', 'org.hk', 'net.hk', 'edu.hk', 'idv.hk',
  ];
  const lastTwo = parts.slice(-2).join('.');
  if (multiPartTlds.includes(lastTwo)) {
    return parts.slice(-3).join('.');
  }

  return parts.slice(-2).join('.');
}

/** @internal Exported for testing. Extracts registrable domain from URL. */
export function extractDomainFromUrl(url) {
  const normalized = url.startsWith('http') ? url : `http://${url}`;
  const hostname = new URL(normalized).hostname;
  return extractDomain(
    getBaseDomain(`https://${hostname}`).replace(/^https?:\/\//, ''),
  );
}

function fetchFromInternicRaw(hostname) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(
      { port: 43, host: 'whois.internic.net' },
      () => {
        client.write(hostname + '\r\n');
      }
    );

    let data = '';
    client.on('data', (chunk) => {
      data += chunk;
    });

    client.on('end', () => {
      resolve(data);
    });

    client.on('error', (err) => {
      reject(err);
    });
  });
}

async function fetchWhoisData(domain) {
  const whoisMod = await import('whois');
  const lookup = whoisMod.lookup || whoisMod.default?.lookup;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`WHOIS lookup timed out after ${WHOIS_TIMEOUT_MS}ms`));
    }, WHOIS_TIMEOUT_MS);

    lookup(domain, { timeout: WHOIS_TIMEOUT_MS }, (err, rawData) => {
      clearTimeout(timer);
      if (err) {
        reject(err);
        return;
      }
      resolve(rawData || '');
    });
  });
}

function parseWhoisResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {};
  }

  const parsed = {};
  const fieldMap = {
    'domain name': 'domainName',
    registrar: 'registrar',
    'registrar name': 'registrar', // .hk, .uk and other ccTLDs
    'registrar url': 'registrarUrl',
    'registrar whois server': 'registrarWhoisServer',
    'updated date': 'updatedDate',
    'creation date': 'creationDate',
    'registry expiry date': 'expiryDate',
    'registrar registration expiration date': 'expiryDate',
    'registration date': 'creationDate', // some ccTLDs
    'domain name commencement date': 'creationDate', // .hk gov.hk format
    'expiry date': 'expiryDate',
    'expiration date': 'expiryDate',
    'name server': 'nameServers',
    'domain status': 'domainStatus',
    'registrant organization': 'registrantOrg',
    'registrant country': 'registrantCountry',
    'registrant state/province': 'registrantState',
    'admin email': 'adminEmail',
    'tech email': 'techEmail',
    dnssec: 'dnssec',
  };

  const lines = rawText.split('\n');
  const nameServers = [];
  const domainStatuses = [];
  let inNameServersSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const colonIndex = line.indexOf(':');

    // HK format: "Name Servers Information:" then standalone lines like "NS01.SCIG.GOV.HK"
    if (colonIndex !== -1) {
      inNameServersSection = false;
      const key = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();

      if (key === 'name servers information' || key === 'name server') {
        inNameServersSection = key === 'name servers information';
        if (key === 'name server' && value) {
          const ns = value.toLowerCase().split(/\s+/)[0];
          if (ns && !nameServers.includes(ns)) nameServers.push(ns);
        }
        continue;
      }
      if (!value) continue;

      if (key === 'domain status') {
        const statusVal = value.split(/\s+/)[0];
        if (statusVal && !domainStatuses.includes(statusVal)) domainStatuses.push(statusVal);
      } else if (fieldMap[key] && !parsed[fieldMap[key]]) {
        parsed[fieldMap[key]] = value;
      }
    } else if (inNameServersSection && trimmed) {
      // Standalone hostname line under Name Servers Information
      const ns = trimmed.toLowerCase();
      if (/^[a-z0-9][a-z0-9.-]*\.[a-z0-9.-]+$/i.test(ns) && !nameServers.includes(ns)) {
        nameServers.push(ns);
      }
    }
  }

  if (nameServers.length > 0) {
    parsed.nameServers = [...new Set(nameServers)];
  }
  if (domainStatuses.length > 0) {
    parsed.domainStatus = domainStatuses;
  }

  return parsed;
}

async function whoisHandler(url) {
  const startTime = Date.now();

  try {
    const domain = extractDomainFromUrl(url);

    if (!domain) {
      return {
        success: false,
        data: {},
        error: 'Unable to extract domain from URL',
        duration_ms: Date.now() - startTime,
      };
    }

    const cached = getCached(domain);
    if (cached) {
      return {
        success: Object.keys(cached).length > 1,
        data: { ...cached },
        duration_ms: Date.now() - startTime,
      };
    }

    let rawText = '';
    let parsed = {};
    const rateLimitPattern = /maintain.*(\d+).*second|rate limit|too many requests/i;

    const doLookup = async () => {
      rawText = await fetchWhoisData(domain);
      parsed = parseWhoisResponse(String(rawText));
      const isRateLimited =
        !parsed.registrar &&
        !parsed.domainName &&
        typeof rawText === 'string' &&
        rateLimitPattern.test(rawText);
      return isRateLimited;
    };

    try {
      let isRateLimited = await doLookup();
      if (isRateLimited && WHOIS_RATE_LIMIT_RETRY_DELAY_MS > 0) {
        await sleep(WHOIS_RATE_LIMIT_RETRY_DELAY_MS);
        isRateLimited = await doLookup();
      }
    } catch (whoisErr) {
      try {
        rawText = await fetchFromInternicRaw(domain);
        if (rawText) {
          parsed = parseWhoisResponse(rawText);
        }
      } catch (internicErr) {
        const msg = `${whoisErr?.message || whoisErr}, ${internicErr?.message || internicErr}`;
        logger.warn({ domain, error: msg }, 'whois: lookup failed');
      }
    }

    const hasData = Object.keys(parsed).length > 0;
    const rawTruncated = typeof rawText === 'string'
      ? rawText.slice(0, 5000)
      : '';

    const data = {
      domain,
      ...parsed,
      rawText: rawTruncated,
    };

    if (hasData) setCache(domain, data);

    return {
      success: hasData,
      data,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      data: {},
      error: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime,
    };
  }
}

export const handler = middleware(whoisHandler);
export default handler;
