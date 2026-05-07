// Centralised URL handling. Every scan module should resort to these helpers
// so we never have a module probing http while another probes https for the
// same input.

const DEFAULT_PROTOCOL = 'https://';

export function normalizeUrl(input, { defaultProtocol = DEFAULT_PROTOCOL } = {}) {
  if (typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${defaultProtocol}${trimmed.replace(/^\/+/, '')}`;
}

export function extractHostname(input) {
  if (typeof input !== 'string' || !input.trim()) return '';
  try {
    return new URL(normalizeUrl(input)).hostname;
  } catch {
    return '';
  }
}

export function isSameOrigin(a, b) {
  const hostA = extractHostname(a);
  const hostB = extractHostname(b);
  if (!hostA || !hostB) return false;
  return hostA.toLowerCase() === hostB.toLowerCase();
}
