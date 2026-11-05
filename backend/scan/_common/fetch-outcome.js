// Transport failures have no target HTTP status. Keep their reason separate
// from module execution and from the target's availability classification.
const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN']);
const TIMEOUT_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT']);
const TLS_CODES = new Set([
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_NOT_YET_VALID',
]);

export function classifyFetchFailure(error) {
  const code = error?.code;
  if (code === 'CIRCUIT_OPEN') return 'circuit_open';
  if (DNS_CODES.has(code)) return 'dns_error';
  if (TIMEOUT_CODES.has(code)) return 'timeout';
  if (TLS_CODES.has(code) || (typeof code === 'string' && (code.startsWith('ERR_TLS_') || code.startsWith('ERR_SSL_')))) return 'tls_error';
  return 'network_error';
}
