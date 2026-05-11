// Scan module: fetch `/.well-known/security.txt` and parse the RFC-9116
// fields (Contact, Expires, Encryption, etc.).
//
// History:
//   - Pre S-4 (middleReport.md): used `follow-redirects` with NO per-call
//     timeout. A slow upstream would bleed into the middleware-level 60 s
//     limit, blocking the runner for the full module budget.
//   - S-4: switch to the shared `_common/http.js` axios instance. Each
//     candidate path has its own short timeout, retry is disabled for 5xx
//     by default (S-2), and the circuit breaker (S-1) protects downstream
//     modules from cascading slowness.

import { URL } from 'url';

import { http } from './_common/http.js';
import middleware from './_common/middleware.js';

const SECURITY_TXT_PATHS = ['/security.txt', '/.well-known/security.txt'];
const PER_PATH_TIMEOUT_MS = parseInt(
  process.env.MODULE_SECURITY_TXT_TIMEOUT_MS || '5000',
  10,
);
const FIELD_REGEX = /^([^:]+):\s*(.+)$/;
const MAX_RESPONSE_BYTES = 256 * 1024;
const HTTP_OK_STATUS = 200;

const parseResult = (text) => {
  const fields = {};
  const counts = {};
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('-----') || line.trim() === '') {
      continue;
    }
    const match = line.match(FIELD_REGEX);
    if (!match || match.length <= 2) continue;
    let key = match[1].trim();
    const value = match[2].trim();
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      counts[key] = counts[key] ? counts[key] + 1 : 1;
      key += counts[key];
    }
    fields[key] = value;
  }
  return fields;
};

const isPgpSigned = (text) => text.includes('-----BEGIN PGP SIGNED MESSAGE-----');

async function fetchSecurityTxt(baseURL, path) {
  const targetUrl = new URL(path, baseURL).toString();
  const response = await http.get(targetUrl, {
    timeout: PER_PATH_TIMEOUT_MS,
    maxContentLength: MAX_RESPONSE_BYTES,
    maxRedirects: 3,
    responseType: 'text',
    transformResponse: (raw) => raw,
  });
  if (response.status !== HTTP_OK_STATUS) {
    return null;
  }
  const body = typeof response.data === 'string' ? response.data : String(response.data || '');
  return body;
}

/**
 * Scan module: fetch `/.well-known/security.txt` and parse the RFC-9116
 * fields (Contact, Expires, Encryption, etc.).
 *
 * @param {string} urlParam Normalised target URL.
 * @returns {Promise<{isPresent: boolean, fields?: object, error?: string}>}
 */
const securityTxtHandler = async (urlParam) => {
  let url;
  try {
    url = new URL(urlParam.includes('://') ? urlParam : `https://${urlParam}`);
  } catch (error) {
    // P2-8: keep the underlying URL parser failure as cause for diagnosis.
    throw new Error('Invalid URL format', { cause: error });
  }
  url.pathname = '';

  for (const path of SECURITY_TXT_PATHS) {
    let body;
    try {
      body = await fetchSecurityTxt(url, path);
    } catch (error) {
      // The middleware envelope guarantees a clean error response; we
      // preserve the cause so operators can debug timeouts vs DNS failures.
      throw new Error(`Failed to fetch ${path}: ${error.message}`, { cause: error });
    }
    if (!body) continue;
    if (body.includes('<html')) return { isPresent: false };
    return {
      isPresent: true,
      foundIn: path,
      content: body,
      isPgpSigned: isPgpSigned(body),
      fields: parseResult(body),
    };
  }

  return { isPresent: false };
};

export const handler = middleware(securityTxtHandler);
export default handler;
