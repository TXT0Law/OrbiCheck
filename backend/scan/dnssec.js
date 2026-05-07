import https from 'https';

import middleware from './_common/middleware.js';
import { extractHostname } from './_common/url.js';

const DNS_TYPES = ['DNSKEY', 'DS', 'RRSIG'];
const DOH_PROVIDERS = [
  { hostname: 'dns.google', path: '/resolve' },
  { hostname: '1.1.1.1', path: '/dns-query' }, // Cloudflare fallback
];
const RECORD_TIMEOUT_MS = parseInt(process.env.DNSSEC_RECORD_TIMEOUT_MS || '5000', 10);

function fetchDohRecord(provider, domain, type, timeoutMs) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: provider.hostname,
      path: `${provider.path}?name=${encodeURIComponent(domain)}&type=${type}`,
      method: 'GET',
      headers: { Accept: 'application/dns-json' },
      timeout: timeoutMs,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (parseError) {
          reject(new Error('Invalid JSON response from DoH provider', { cause: parseError }));
        }
      });
      res.on('error', reject);
    });

    req.on('timeout', () => {
      const err = new Error(`DoH request timed out after ${timeoutMs}ms`);
      err.code = 'DNSSEC_TIMEOUT';
      req.destroy(err);
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchRecordWithFallback(domain, type) {
  let lastError = null;
  for (const provider of DOH_PROVIDERS) {
    try {
      return await fetchDohRecord(provider, domain, type, RECORD_TIMEOUT_MS);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('All DoH providers failed');
}

async function dnsSecHandler(rawUrl) {
  const domain = extractHostname(rawUrl) || rawUrl;

  const settled = await Promise.allSettled(
    DNS_TYPES.map(async (type) => {
      const dnsResponse = await fetchRecordWithFallback(domain, type);
      const hasAnswer = Array.isArray(dnsResponse.Answer) && dnsResponse.Answer.length > 0;
      return {
        type,
        record: hasAnswer
          ? { isFound: true, answer: dnsResponse.Answer, response: dnsResponse.Answer }
          : { isFound: false, answer: null, response: dnsResponse },
      };
    }),
  );

  const records = {};
  let anySuccess = false;
  for (let i = 0; i < settled.length; i += 1) {
    const result = settled[i];
    const type = DNS_TYPES[i];
    if (result.status === 'fulfilled') {
      records[type] = result.value.record;
      anySuccess = true;
    } else {
      records[type] = {
        isFound: false,
        answer: null,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    }
  }

  if (!anySuccess) {
    throw new Error(
      `All DNSSEC record lookups failed: ${Object.values(records).map((r) => r.error || 'unknown').join('; ')}`,
    );
  }

  return records;
}

export const handler = middleware(dnsSecHandler);
export default handler;
