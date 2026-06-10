/**
 * Lightweight tech hints when Wappalyzer returns nothing (blocked, timeout, crash).
 * Uses HTTP(S) response headers only — same shape as Wappalyzer entries for transformers.
 */

import { createLinkedAbortController, isAbortError } from './abort.js';

const normalizeTargetUrl = (url) => {
  const u = (url || '').trim();
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
};

/**
 * @param {Headers} headers
 * @returns {{ name: string, categories: { name: string }[], confidence: number }[]}
 */
export function technologiesFromResponseHeaders(headers) {
  const technologies = [];
  const seen = new Set();

  const add = (name, category, confidence = 55) => {
    if (!name || typeof name !== 'string') return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    technologies.push({
      name,
      categories: [{ name: category }],
      confidence,
    });
  };

  const server = (headers.get('server') || '').trim();
  const poweredBy = (headers.get('x-powered-by') || '').trim();
  const via = (headers.get('via') || '').trim();

  if (headers.has('cf-ray') || /cloudflare/i.test(server)) {
    add('Cloudflare', 'CDN', 70);
  }
  if (headers.has('x-vercel-id') || headers.has('x-vercel-cache')) {
    add('Vercel', 'PaaS', 70);
  }
  if (headers.has('x-nf-request-id') || /netlify/i.test(server)) {
    add('Netlify', 'PaaS', 65);
  }
  if (/fastly/i.test(server) || /fastly/i.test(via)) {
    add('Fastly', 'CDN', 65);
  }
  if (/cloudfront/i.test(via) || headers.has('x-amz-cf-id')) {
    add('Amazon CloudFront', 'CDN', 65);
  }
  if (/akamai/i.test(server) || /akamai/i.test(via)) {
    add('Akamai', 'CDN', 60);
  }

  if (/nginx/i.test(server)) {
    add('Nginx', 'Web servers', 60);
  } else if (/apache/i.test(server)) {
    add('Apache', 'Web servers', 60);
  } else if (/caddy/i.test(server)) {
    add('Caddy', 'Web servers', 55);
  } else if (/microsoft-iis/i.test(server)) {
    add('IIS', 'Web servers', 60);
  } else if (server && !/cloudflare|netlify|vercel|fastly/i.test(server)) {
    const product = server.split('/')[0].trim();
    if (product.length > 0 && product.length < 80) {
      add(product, 'Web servers', 40);
    }
  }

  if (/php/i.test(poweredBy)) {
    add('PHP', 'Programming languages', 55);
  }
  if (/express/i.test(poweredBy)) {
    add('Express', 'Web frameworks', 50);
  }
  if (/asp\.net/i.test(poweredBy)) {
    add('ASP.NET', 'Web frameworks', 55);
  }

  let setCookieParts = [];
  if (typeof headers.getSetCookie === 'function') {
    setCookieParts = headers.getSetCookie();
  }
  const cookieBlob = [...setCookieParts, headers.get('set-cookie') || '']
    .join(';')
    .toLowerCase();
  if (cookieBlob.includes('wp-settings') || cookieBlob.includes('wordpress')) {
    add('WordPress', 'CMS', 50);
  }

  return technologies;
}

/**
 * @param {string} targetUrl
 * @param {{ timeoutMs?: number, signal?: AbortSignal }} [options]
 */
export async function detectTechFromHeaders(targetUrl, options = {}) {
  const url = normalizeTargetUrl(targetUrl);
  if (!url) {
    return { technologies: [] };
  }

  const timeoutMs = options.timeoutMs ?? 12000;
  const { signal, cleanup } = createLinkedAbortController(options.signal, timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OrbiCheck-Scan/1.0)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    });
    return { technologies: technologiesFromResponseHeaders(res.headers) };
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return { technologies: [] };
  } finally {
    cleanup();
  }
}
