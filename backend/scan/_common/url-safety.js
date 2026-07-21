import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

import axios from 'axios';

const DEFAULT_MAX_REDIRECTS = 5;
const HTTP_PORT = 80;
const HTTPS_PORT = 443;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
]);
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
]);

const BLOCKED_ADDRESSES = new net.BlockList();
[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([address, prefix]) => BLOCKED_ADDRESSES.addSubnet(address, prefix, 'ipv4'));
[
  ['::', 128],
  ['::1', 128],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
].forEach(([address, prefix]) => BLOCKED_ADDRESSES.addSubnet(address, prefix, 'ipv6'));

export class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeUrlError';
    this.code = 'UNSAFE_URL';
  }
}

export function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return !BLOCKED_ADDRESSES.check(address, 'ipv4');
  if (family === 6) {
    if (address.toLowerCase().startsWith('::ffff:')) return false;
    return !BLOCKED_ADDRESSES.check(address, 'ipv6');
  }
  return false;
}

function allowPrivateForTests() {
  return process.env.NODE_ENV === 'test'
    && process.env.SCAN_ENFORCE_URL_SAFETY_IN_TESTS !== 'true';
}

export function isRuntimeUrlSafetyEnabled() {
  return !allowPrivateForTests();
}

export async function resolvePublicUrl(
  input,
  {
    requireHttps = false,
    lookup = dns.promises.lookup,
    allowPrivate = allowPrivateForTests(),
  } = {},
) {
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new UnsafeUrlError('URL is invalid');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new UnsafeUrlError('Only HTTP(S) URLs are allowed');
  }
  if (requireHttps && parsed.protocol !== 'https:') {
    throw new UnsafeUrlError('URL must use HTTPS');
  }
  if (parsed.username || parsed.password) {
    throw new UnsafeUrlError('URL credentials are not allowed');
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (!hostname) throw new UnsafeUrlError('URL has no hostname');
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UnsafeUrlError(`Blocked hostname: ${hostname}`);
  }
  if (hostname.includes('%')) {
    throw new UnsafeUrlError('IPv6 zone identifiers are not allowed');
  }

  const literalFamily = net.isIP(hostname);
  let records;
  if (literalFamily) {
    records = [{ address: hostname, family: literalFamily }];
  } else {
    try {
      records = await lookup(hostname, { all: true, verbatim: true });
    } catch (error) {
      throw new UnsafeUrlError(`Cannot resolve hostname: ${hostname}`, { cause: error });
    }
  }
  const unique = records.filter(
    (record, index, all) => all.findIndex(
      (candidate) => candidate.address === record.address,
    ) === index,
  );
  if (unique.length === 0) {
    throw new UnsafeUrlError(`Cannot resolve hostname: ${hostname}`);
  }
  if (!allowPrivate) {
    const blocked = unique.find((record) => !isPublicAddress(record.address));
    if (blocked) {
      throw new UnsafeUrlError(`URL resolves to blocked network: ${blocked.address}`);
    }
  }

  return {
    url: parsed,
    hostname,
    port: Number(parsed.port || (parsed.protocol === 'https:' ? HTTPS_PORT : HTTP_PORT)),
    addresses: unique,
    address: unique[0].address,
    family: unique[0].family,
  };
}

function pinnedLookup(resolved) {
  return (_hostname, options, callback) => {
    if (options?.all) {
      callback(null, [{ address: resolved.address, family: resolved.family }]);
      return;
    }
    callback(null, resolved.address, resolved.family);
  };
}

function redirectMethod(method, status) {
  const normalized = String(method || 'get').toLowerCase();
  if (status === 303 && normalized !== 'head') return 'get';
  if ([301, 302].includes(status) && normalized === 'post') return 'get';
  return normalized;
}

function stripSensitiveHeaders(headers) {
  const next = axios.AxiosHeaders.from(headers);
  for (const name of SENSITIVE_HEADERS) next.delete(name);
  return next;
}

export function createSafeHttpAdapter({
  maxRedirects = DEFAULT_MAX_REDIRECTS,
  resolveUrl = resolvePublicUrl,
  adapter = null,
} = {}) {
  const defaultAdapter = adapter || axios.getAdapter('http');
  return async (config) => {
    if (!adapter && !isRuntimeUrlSafetyEnabled()) {
      return defaultAdapter(config);
    }
    let currentUrl = new URL(config.url, config.baseURL);
    let currentMethod = config.method || 'get';
    let currentData = config.data;
    let currentHeaders = axios.AxiosHeaders.from(config.headers);
    const redirectLimit = Number.isInteger(config.orbicheckMaxRedirects)
      ? config.orbicheckMaxRedirects
      : maxRedirects;

    for (let redirects = 0; ; redirects += 1) {
      const resolved = await resolveUrl(currentUrl.toString());
      const lookup = pinnedLookup(resolved);
      const httpAgent = new http.Agent({ lookup });
      const httpsAgent = new https.Agent({
        lookup,
        rejectUnauthorized: config.orbicheckRejectUnauthorized !== false,
      });
      let response;
      try {
        response = await defaultAdapter({
          ...config,
          baseURL: undefined,
          url: currentUrl.toString(),
          method: currentMethod,
          data: currentData,
          headers: currentHeaders,
          maxRedirects: 0,
          httpAgent,
          httpsAgent,
          validateStatus: () => true,
        });
      } finally {
        httpAgent.destroy();
        httpsAgent.destroy();
      }

      const location = response.headers?.location;
      if (!REDIRECT_STATUSES.has(response.status) || !location) {
        return response;
      }
      if (redirectLimit === 0) return response;
      if (redirects >= redirectLimit) {
        throw new UnsafeUrlError('Too many redirects');
      }

      const nextUrl = new URL(location, currentUrl);
      if (nextUrl.origin !== currentUrl.origin) {
        currentHeaders = stripSensitiveHeaders(currentHeaders);
      }
      const nextMethod = redirectMethod(currentMethod, response.status);
      if (nextMethod !== currentMethod) {
        currentData = undefined;
        currentHeaders.delete('Content-Type');
        currentHeaders.delete('Content-Length');
      }
      currentMethod = nextMethod;
      currentUrl = nextUrl;
    }
  };
}

export function targetAddressFromRequest(request, fallbackHostname) {
  return request?.context?.resolvedTarget?.address || fallbackHostname;
}
