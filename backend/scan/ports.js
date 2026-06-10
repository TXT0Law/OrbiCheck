import net from 'net';

import {
  createAbortError,
  createLinkedAbortController,
  getRequestSignal,
  isAbortError,
  throwIfAborted,
} from './_common/abort.js';
import { logger } from './_common/logger.js';
import middleware from './_common/middleware.js';

const QUICK_PORTS = [
  21, 22, 25, 53, 80, 110, 143, 443, 993, 995,
  3306, 3389, 5432, 8080, 8443,
];
const STANDARD_PORTS = [
  20, 21, 22, 23, 25, 53, 67, 68, 69, 80,
  110, 111, 119, 123, 135, 137, 138, 139, 143, 156,
  161, 162, 179, 194, 389, 443, 445, 465, 587, 631,
  993, 995, 1433, 1521, 2049, 2375, 3000, 3306, 3389, 5060,
  5432, 5900, 6379, 8000, 8080, 8443, 8888, 9200, 27017
];
const DEEP_PORTS = [...STANDARD_PORTS,
  554, 1080, 1194, 1723, 2082, 2083, 2086, 2087, 2096, 3128,
  4443, 5000, 5001, 5222, 5269, 5601, 6443, 6660, 6661, 6662,
  6663, 6664, 6665, 6666, 6667, 6668, 6669, 7443, 8009, 8081,
  8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090, 8181,
  8444, 8880, 8881, 8882, 8883, 9000, 9001, 9090, 9091, 9443,
  9999, 10000, 10443, 11211, 15672, 27018, 27019, 50000,
];
const HTTP_PROBE_PORTS = new Set([80, 443, 8000, 8080, 8443, 8888]);
const FILTERED_ERROR_CODES = new Set(['ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH']);
const CONNECT_TIMEOUT_MS = 1500;
const BANNER_TIMEOUT_MS = 2000;
const GLOBAL_TIMEOUT_MS = 45000;
const MAX_BANNER_LENGTH = 512;
const HTTP_HEAD_PROBE = 'HEAD / HTTP/1.0\r\n\r\n';
const MIN_PORT = 1;
const MAX_PORT = 65535;
const DEFAULT_PORT_SCAN_PROFILE = 'quick';
const NMAP_SCANNER_TIMEOUT_MS = 60000;
const MAX_CONCURRENT = 12;
const PROXY_NOTE = 'Target appears to be behind a CDN/proxy. Open port results may reflect the proxy infrastructure rather than the actual server.';
const HOST_STATUS_METHOD = 'tcp-connect';
const HTTP_PROXY_HEADER_NAMES = ['server', 'cf-ray', 'x-powered-by', 'proxy-status'];
const CDN_SIGNATURES = [
  { label: 'Cloudflare', patterns: ['cloudflare', 'cf-ray'] },
  { label: 'Akamai', patterns: ['akamai'] },
  { label: 'Fastly', patterns: ['fastly'] },
  { label: 'AWS', patterns: ['amazon', 'cloudfront', 'aws'] },
  { label: 'Incapsula', patterns: ['incapsula', 'imperva'] },
];
const PROFILE_PORTS = {
  quick: QUICK_PORTS,
  standard: STANDARD_PORTS,
  deep: DEEP_PORTS,
};

function parsePortsSetting(value) {
  if (!value) {
    return STANDARD_PORTS;
  }

  const parsedPorts = new Set();

  for (const token of String(value).split(',')) {
    const trimmed = token.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.includes('-')) {
      const [startRaw, endRaw] = trimmed.split('-', 2);
      const start = Number.parseInt(startRaw, 10);
      const end = Number.parseInt(endRaw, 10);
      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        continue;
      }

      const from = Math.max(MIN_PORT, Math.min(start, end));
      const to = Math.min(MAX_PORT, Math.max(start, end));
      for (let port = from; port <= to; port += 1) {
        parsedPorts.add(port);
      }
      continue;
    }

    const port = Number.parseInt(trimmed, 10);
    if (Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT) {
      parsedPorts.add(port);
    }
  }

  return parsedPorts.size > 0
    ? [...parsedPorts].sort((left, right) => left - right)
    : STANDARD_PORTS;
}

function delay(ms, signal = null) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(signal?.reason || createAbortError());
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

function sanitizeBanner(data) {
  return String(data)
    .replace(/\0/g, '')
    .trim()
    .slice(0, MAX_BANNER_LENGTH);
}

function getPortsForProfile(profile) {
  // P2-3: PORTS_TO_CHECK is a hard override (intentional escape hatch for
  // operators), but log a warning whenever it shadows an explicit profile so
  // misconfiguration is visible instead of silent.
  if (process.env.PORTS_TO_CHECK) {
    if (profile && profile !== DEFAULT_PORT_SCAN_PROFILE) {
      logger.warn(
        { profile, portsToCheck: process.env.PORTS_TO_CHECK },
        'ports: PORTS_TO_CHECK env overrides scan profile',
      );
    }
    return parsePortsSetting(process.env.PORTS_TO_CHECK);
  }

  return PROFILE_PORTS[normalizeProfile(profile)] || QUICK_PORTS;
}

function extractHttpHeaderValue(headers, name) {
  const loweredName = name.toLowerCase();
  const matchingHeader = headers.find((header) => header.toLowerCase().startsWith(`${loweredName}:`));
  if (!matchingHeader) {
    return '';
  }

  const [, ...parts] = matchingHeader.split(':');
  return parts.join(':').trim();
}

function formatHttpBanner(rawBanner) {
  const sanitized = sanitizeBanner(rawBanner);
  if (!sanitized.startsWith('HTTP/')) {
    return sanitized;
  }

  const lines = sanitized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return sanitized;
  }

  const parts = [lines[0]];
  const server = extractHttpHeaderValue(lines.slice(1), 'server');
  if (server) {
    parts.push(`Server: ${server}`);
  }

  for (const headerName of ['cf-ray', 'x-powered-by', 'proxy-status']) {
    const value = extractHttpHeaderValue(lines.slice(1), headerName);
    if (value) {
      parts.push(`${headerName.toUpperCase()}: ${value}`);
    }
  }

  return sanitizeBanner(parts.join(' | '));
}

function formatBanner(rawBanner, port) {
  const sanitized = sanitizeBanner(rawBanner);
  if (!sanitized) {
    return '';
  }

  if (sanitized.startsWith('HTTP/') || (HTTP_PROBE_PORTS.has(port) && sanitized.includes('\n'))) {
    return formatHttpBanner(sanitized);
  }

  return sanitized;
}

function buildPortResult(port, state, banner = '', reason = undefined, latencyMs = undefined) {
  return {
    port,
    banner,
    state,
    ...(reason ? { reason } : {}),
    ...(Number.isFinite(latencyMs) ? { latencyMs } : {}),
  };
}

function buildScanSummary(closedCount, filteredCount, totalPortsScanned) {
  const hiddenStates = [];
  if (closedCount > 0) {
    hiddenStates.push(`${closedCount} closed ports`);
  }
  if (filteredCount > 0) {
    hiddenStates.push(`${filteredCount} filtered ports`);
  }

  return {
    notShown: hiddenStates.length > 0 ? `Not shown: ${hiddenStates.join(', ')}.` : '',
    closedCount,
    filteredCount,
    totalPortsScanned,
  };
}

function normalizeProfile(profile) {
  const value = String(profile || DEFAULT_PORT_SCAN_PROFILE).trim().toLowerCase();
  return ['quick', 'standard', 'deep'].includes(value)
    ? value
    : DEFAULT_PORT_SCAN_PROFILE;
}

function detectProxyProvider(text) {
  const normalized = String(text || '').toLowerCase();
  for (const signature of CDN_SIGNATURES) {
    if (signature.patterns.some((pattern) => normalized.includes(pattern))) {
      return signature.label;
    }
  }
  return null;
}

function detectCdnProxy(openPorts, allResults) {
  const totalPorts = allResults.length;
  if (totalPorts === 0) {
    return { behindProxy: false, proxyProvider: null };
  }

  const openRate = openPorts.length / totalPorts;
  const combinedBanners = openPorts.map((port) => port.banner || '').join('\n');
  const detectedProvider = detectProxyProvider(combinedBanners);

  if (openRate === 1) {
    return {
      behindProxy: true,
      proxyProvider: detectedProvider,
    };
  }

  if (openRate > 0.8 && detectedProvider) {
    return {
      behindProxy: true,
      proxyProvider: detectedProvider,
    };
  }

  const httpBannerProvider = openPorts
    .filter((result) => HTTP_PROBE_PORTS.has(result.port))
    .map((result) => detectProxyProvider(result.banner))
    .find(Boolean);

  const hasProxyHeaders = openPorts
    .filter((result) => HTTP_PROBE_PORTS.has(result.port))
    .some((result) => {
      const banner = String(result.banner || '').toLowerCase();
      return HTTP_PROXY_HEADER_NAMES.some((headerName) => banner.includes(headerName));
    });

  if (httpBannerProvider || hasProxyHeaders) {
    return {
      behindProxy: true,
      proxyProvider: httpBannerProvider || detectedProvider,
    };
  }

  return { behindProxy: false, proxyProvider: null };
}

async function mapWithConcurrency(items, fn, concurrency = MAX_CONCURRENT, signal = null) {
  const results = new Array(items.length);
  let index = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        throwIfAborted(signal);
        const currentIndex = index;
        index += 1;
        results[currentIndex] = await fn(items[currentIndex], currentIndex);
      }
    }
  );

  await Promise.all(workers);
  return results;
}

async function checkPort(port, domain, signal = null) {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const socket = new net.Socket();
    const startedAt = Date.now();
    let connected = false;
    let settled = false;
    let bannerTimer;

    const finish = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      if (bannerTimer) {
        clearTimeout(bannerTimer);
      }
      socket.removeAllListeners();
      if (signal) {
        signal.removeEventListener('abort', abort);
      }
      socket.destroy();
      resolve(result);
    };

    const abort = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (bannerTimer) {
        clearTimeout(bannerTimer);
      }
      socket.removeAllListeners();
      socket.destroy();
      reject(signal?.reason || createAbortError());
    };

    if (signal) {
      signal.addEventListener('abort', abort, { once: true });
    }

    socket.setTimeout(CONNECT_TIMEOUT_MS);

    socket.once('connect', () => {
      connected = true;
      const latencyMs = Date.now() - startedAt;
      socket.setTimeout(BANNER_TIMEOUT_MS);
      socket.once('data', (data) => {
        finish(buildPortResult(
          port,
          'open',
          formatBanner(data.toString('utf8'), port),
          'syn-ack',
          latencyMs,
        ));
      });

      if (HTTP_PROBE_PORTS.has(port)) {
        try {
          socket.write(HTTP_HEAD_PROBE);
        } catch (error) {
          finish(buildPortResult(port, 'open', '', 'syn-ack', latencyMs));
          return;
        }
      }

      bannerTimer = setTimeout(() => {
        finish(buildPortResult(port, 'open', '', 'syn-ack', latencyMs));
      }, BANNER_TIMEOUT_MS);
    });

    socket.once('timeout', () => {
      if (connected) {
        finish(buildPortResult(port, 'open', '', 'syn-ack'));
        return;
      }

      finish(buildPortResult(port, 'filtered', '', 'no-response'));
    });

    socket.once('error', (error) => {
      if (connected) {
        finish(buildPortResult(port, 'open', '', 'syn-ack'));
        return;
      }

      const state = FILTERED_ERROR_CODES.has(error?.code)
        ? 'filtered'
        : 'closed';
      const reason = state === 'filtered'
        ? 'no-response'
        : 'conn-refused';
      finish(buildPortResult(port, state, '', reason));
    });

    socket.connect(port, domain);
  });
}

async function scanPorts(domain, profile, signal = null) {
  const startedAtMs = Date.now();
  const startTime = new Date(startedAtMs).toISOString();
  const portsToScan = getPortsForProfile(profile);
  const results = await mapWithConcurrency(
    portsToScan,
    (port) => checkPort(port, domain, signal),
    MAX_CONCURRENT,
    signal,
  );
  const openPorts = [];
  const closedPorts = [];
  const filteredPorts = [];

  for (const result of results) {
    if (result.state === 'open') {
      openPorts.push({
        port: result.port,
        banner: result.banner,
        reason: result.reason,
      });
      continue;
    }

    if (result.state === 'filtered') {
      filteredPorts.push({
        port: result.port,
        reason: result.reason,
      });
      continue;
    }

    closedPorts.push({
      port: result.port,
      reason: result.reason,
    });
  }

  const cdnProxyDetection = detectCdnProxy(openPorts, results);
  const completedAtMs = Date.now();
  const durationMs = completedAtMs - startedAtMs;
  const latencyResult = results.find((result) => Number.isFinite(result.latencyMs));
  const hostUp = results.some((result) => result.reason && result.reason !== 'no-response');
  const scanSummary = buildScanSummary(
    closedPorts.length,
    filteredPorts.length,
    results.length,
  );

  return {
    engine: 'native',
    profile: normalizeProfile(profile),
    method: 'native-tcp-connect',
    durationMs,
    startTime,
    endTime: new Date(completedAtMs).toISOString(),
    openPorts: openPorts.sort((left, right) => left.port - right.port),
    closedPorts: closedPorts.sort((left, right) => left.port - right.port),
    filteredPorts: filteredPorts.sort((left, right) => left.port - right.port),
    detectedTechnologies: [],
    osFingerprint: null,
    hostStatus: {
      up: hostUp,
      latency: latencyResult?.latencyMs,
      method: HOST_STATUS_METHOD,
    },
    scanSummary,
    scanStats: {
      startTime,
      endTime: new Date(completedAtMs).toISOString(),
      elapsedSeconds: Number((durationMs / 1000).toFixed(3)),
      hostsUp: hostUp ? 1 : 0,
      hostsTotal: 1,
    },
    behindProxy: cdnProxyDetection.behindProxy,
    proxyProvider: cdnProxyDetection.proxyProvider,
    note: cdnProxyDetection.behindProxy ? PROXY_NOTE : undefined,
  };
}

async function scanPortsWithNative(domain, profile, signal = null) {
  return scanPorts(domain, profile, signal);
}

async function scanPortsWithNmap(domain, profile, signal = null) {
  const scannerBaseUrl = process.env.NMAP_SCANNER_URL;
  if (!scannerBaseUrl) {
    throw new Error('NMAP_SCANNER_URL is not configured');
  }

  const { signal: nmapSignal, cleanup } = createLinkedAbortController(
    signal,
    NMAP_SCANNER_TIMEOUT_MS,
  );
  try {
    const response = await fetch(`${scannerBaseUrl.replace(/\/$/, '')}/scan/ports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ target: domain, profile }),
      signal: nmapSignal,
    });

    if (!response.ok) {
      throw new Error(`Scanner returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    const scanStats = payload.scanStats ?? payload.scan_stats ?? null;
    const startTime = payload.startTime
      ?? payload.start_time
      ?? scanStats?.startTime
      ?? scanStats?.start_time;
    const endTime = payload.endTime
      ?? payload.end_time
      ?? scanStats?.endTime
      ?? scanStats?.end_time;
    return {
      engine: payload.engine || 'nmap',
      profile: payload.profile || profile,
      method: payload.method || 'nmap',
      durationMs: payload.durationMs ?? payload.duration_ms ?? 0,
      startTime,
      endTime,
      openPorts: Array.isArray(payload.openPorts)
        ? payload.openPorts
        : (payload.open_ports || []),
      closedPorts: Array.isArray(payload.closedPorts)
        ? payload.closedPorts
        : (payload.closed_ports || []),
      filteredPorts: Array.isArray(payload.filteredPorts)
        ? payload.filteredPorts
        : (payload.filtered_ports || []),
      detectedTechnologies: Array.isArray(payload.detectedTechnologies)
        ? payload.detectedTechnologies
        : (payload.detected_technologies || []),
      osFingerprint: payload.osFingerprint ?? payload.os_fingerprint ?? null,
      osDetection: payload.osDetection ?? payload.os_detection ?? null,
      traceroute: payload.traceroute ?? [],
      scanStats: scanStats,
      hostStatus: payload.hostStatus ?? payload.host_status ?? null,
      scanSummary: payload.scanSummary ?? payload.scan_summary ?? null,
      behindProxy: Boolean(payload.behindProxy ?? payload.behind_proxy),
      proxyProvider: payload.proxyProvider ?? payload.proxy_provider ?? null,
      note: payload.note,
    };
  } finally {
    cleanup();
  }
}

/**
 * Scan module: probe a profile of TCP ports (quick / standard / deep) via
 * either nmap (when `NMAP_SCANNER_URL` is set) or a native TCP-connect
 * fallback. P2-3 redesigned the env-override + nmap-fallback decision tree.
 *
 * @param {string} url Normalised target URL.
 * @param {object} request Per-request payload (carries `scanOptions`).
 * @returns {Promise<{ports?: Array<{port: number, state: string,
 *   service?: string}>, source?: string, error?: string}>}
 */
const portsHandler = async (url, request) => {
  const domain = new URL(url).hostname;
  const signal = getRequestSignal(request);
  const profile = normalizeProfile(
    request?.body?.scanOptions?.portScanProfile
      ?? request?.body?.scan_options?.port_scan_profile
  );

  // P2-3: explicit decision tree. We only attempt nmap when the operator
  // configured NMAP_SCANNER_URL; otherwise we go straight to the native TCP
  // scan. Errors from either path are surfaced with their real message so we
  // do not mislead callers with a generic "function timed out" string.
  const useNmap = Boolean(process.env.NMAP_SCANNER_URL);

  try {
    return await Promise.race([
      (async () => {
        if (useNmap) {
          try {
            return await scanPortsWithNmap(domain, profile, signal);
          } catch (nmapError) {
            if (isAbortError(nmapError)) {
              throw nmapError;
            }
            // P2-3: log the real reason the nmap scanner failed before we
            // silently fall back to the native scan. Without this,
            // misconfigurations or scanner outages were invisible.
            logger.warn(
              { domain, profile, error: nmapError?.message || String(nmapError) },
              'ports: nmap scanner failed, falling back to native scan',
            );
          }
        }
        return scanPortsWithNative(domain, profile, signal);
      })(),
      delay(GLOBAL_TIMEOUT_MS, signal).then(() => {
        const error = new Error(
          `Port scan timed out after ${GLOBAL_TIMEOUT_MS}ms`,
        );
        error.code = 'PORTS_GLOBAL_TIMEOUT';
        throw error;
      }),
    ]);
  } catch (error) {
    if (error?.code === 'PORTS_GLOBAL_TIMEOUT') {
      return errorResponse(error.message);
    }
    if (isAbortError(error)) {
      throw error;
    }
    return errorResponse(
      `Port scan failed: ${error?.message || String(error)}`,
    );
  }
};

const errorResponse = (message) => {
  return { error: message };
};

export {
  detectCdnProxy,
  formatBanner,
  getPortsForProfile,
  mapWithConcurrency,
  MAX_CONCURRENT,
};
export const handler = middleware(portsHandler);
export default handler;
